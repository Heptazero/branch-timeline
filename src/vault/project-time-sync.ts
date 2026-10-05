import { itemDuration } from "../timeline/model";
import type { BranchTimelineState } from "../types";
import type { VaultRepository } from "./repository";
import type { StateStore } from "./state-store";

export type ProjectSyncStatus = "idle" | "pending" | "synced" | "error";

export function completedProjectTotals(state: BranchTimelineState, date: string): {
  totals: Map<string, number>;
  running: boolean;
} {
  const totals = new Map<string, number>();
  const day = state.days[date];
  if (!day) return { totals, running: false };
  let running = false;
  for (const item of day.items) {
    if (!item.projectPath) continue;
    if (item.factTiming || (item.kind === "todo" && item.startedMin != null)) {
      running = true;
      continue;
    }
    if (item.kind !== "fact" || item.endMin == null) continue;
    const minutes = itemDuration(item, day.wake);
    if (minutes > 0) totals.set(item.projectPath, (totals.get(item.projectPath) || 0) + minutes);
  }
  return { totals, running };
}

export function changedProjectDates(before: BranchTimelineState, after: BranchTimelineState): string[] {
  const dates = new Set([...Object.keys(before.days), ...Object.keys(after.days)]);
  return [...dates].filter(date => {
    const oldItems = before.days[date]?.items || [];
    const newItems = after.days[date]?.items || [];
    return (oldItems.some(item => item.projectPath) || newItems.some(item => item.projectPath))
      && JSON.stringify(oldItems) !== JSON.stringify(newItems);
  });
}

export function completedProjectTaskTotals(state: BranchTimelineState, path: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const day of Object.values(state.days)) {
    for (const item of day.items) {
      if (item.projectPath !== path || !item.projectTaskId || item.kind !== "fact" || item.endMin == null || item.factTiming) continue;
      const minutes = itemDuration(item, day.wake);
      if (minutes > 0) totals.set(item.projectTaskId, (totals.get(item.projectTaskId) || 0) + minutes);
    }
  }
  return totals;
}

export function projectPathsOn(before: BranchTimelineState, after: BranchTimelineState, date: string): string[] {
  const items = [...(before.days[date]?.items || []), ...(after.days[date]?.items || [])];
  return [...new Set(items.filter(item => item.kind === "fact" && item.projectPath)
    .map(item => item.projectPath as string))];
}

export class ProjectTimeSync {
  private pending = new Set<string>();
  private hints = new Map<string, Set<string>>();
  private statuses = new Map<string, ProjectSyncStatus>();
  private errors = new Map<string, string>();
  private callbacks = new Map<string, Array<(status: ProjectSyncStatus) => void>>();
  private processing = false;

  constructor(
    private repository: VaultRepository,
    private store: StateStore,
    private notify: () => void
  ) {}

  status(date: string): ProjectSyncStatus { return this.statuses.get(date) || "pending"; }
  error(date: string): string | undefined { return this.errors.get(date); }

  schedule(date: string, paths: Iterable<string> = [], onFinish?: (status: ProjectSyncStatus) => void): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (onFinish) this.callbacks.set(date, [...(this.callbacks.get(date) || []), onFinish]);
    const hints = this.hints.get(date) || new Set<string>();
    for (const path of paths) hints.add(path);
    this.hints.set(date, hints);
    this.pending.add(date);
    this.statuses.set(date, "pending");
    this.errors.delete(date);
    this.notify();
    if (!this.processing) void this.drain();
  }

  private async drain(): Promise<void> {
    this.processing = true;
    try {
      while (this.pending.size) {
        const date = this.pending.values().next().value as string;
        this.pending.delete(date);
        try {
          const status = await this.syncDate(date);
          if (!this.pending.has(date)) {
            this.statuses.set(date, status);
            this.hints.delete(date);
          }
        } catch (error) {
          if (!this.pending.has(date)) {
            this.statuses.set(date, "error");
            this.errors.set(date, error instanceof Error ? error.message : String(error));
          }
        }
        this.notify();
        if (!this.pending.has(date)) {
          for (const callback of this.callbacks.get(date) || []) callback(this.status(date));
          this.callbacks.delete(date);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async syncDate(date: string): Promise<ProjectSyncStatus> {
    const state = await this.store.load();
    const { totals, running } = completedProjectTotals(state, date);
    const paths = new Set([...totals.keys(), ...(this.hints.get(date) || [])]);
    for (const project of this.repository.listProjects()) {
      const existing = await this.repository.readProjectDayTotal(project.path, date);
      if (existing.owned) paths.add(project.path);
    }
    for (const path of paths) {
      await this.repository.syncProjectDayTotal(path, date, totals.get(path) || 0);
      await this.repository.syncProjectTaskTotals(path, completedProjectTaskTotals(state, path));
    }
    if (running) return "pending";
    return paths.size ? "synced" : "idle";
  }
}

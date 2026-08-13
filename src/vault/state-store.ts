import { App, normalizePath } from "obsidian";
import type { BranchTimelineState, TimelineDayState } from "../types";

const EMPTY_STATE: BranchTimelineState = { version: 1, days: {}, projects: {}, policyNodes: [] };

export class StateStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private app: App, private path: string) {}

  setPath(path: string): void { this.path = path; }

  async load(): Promise<BranchTimelineState> {
    const path = normalizePath(this.path);
    if (!(await this.app.vault.adapter.exists(path))) return structuredClone(EMPTY_STATE);
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(path)) as Partial<BranchTimelineState>;
      return {
        version: 1,
        days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
        projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
        policyNodes: Array.isArray(parsed.policyNodes) ? parsed.policyNodes : []
      };
    } catch {
      return structuredClone(EMPTY_STATE);
    }
  }

  async update(mutator: (state: BranchTimelineState) => void): Promise<BranchTimelineState> {
    let result = structuredClone(EMPTY_STATE);
    this.queue = this.queue.then(async () => {
      result = await this.load();
      mutator(result);
      await this.write(result);
    });
    await this.queue;
    return result;
  }

  async ensure(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(normalizePath(this.path)))) await this.write(EMPTY_STATE);
  }

  private async write(state: BranchTimelineState): Promise<void> {
    const path = normalizePath(this.path);
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent && !(await this.app.vault.adapter.exists(parent))) await this.mkdirRecursive(parent);
    await this.app.vault.adapter.write(path, `${JSON.stringify(state, null, 2)}\n`);
  }

  private async mkdirRecursive(path: string): Promise<void> {
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) await this.app.vault.adapter.mkdir(current);
    }
  }
}

export function defaultDay(wake: number, sleep: number): TimelineDayState {
  return { wake, sleep, pivot: 14 * 60, wakeReal: false, pivotReal: false, sleepReal: false, branches: [], items: [] };
}

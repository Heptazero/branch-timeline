import type { BranchTimelineState, ProjectTimelineBranch, TimelineItem } from "../types";
import { itemStart } from "../timeline/model";

export interface ProjectTimelineEntry {
  date: string;
  item: TimelineItem;
  abs: number;
}

export interface ProjectTimelineRange {
  start: number;
  end: number;
}

export function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dateFromDayNumber(value: number): string {
  const date = new Date(value * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function absoluteMinute(date: string, minute: number): number {
  return dayNumber(date) * 1440 + minute;
}

export function splitAbsoluteMinute(value: number): { date: string; minute: number } {
  const day = Math.floor(value / 1440);
  return { date: dateFromDayNumber(day), minute: value - day * 1440 };
}

export function projectEntries(state: BranchTimelineState, projectPath: string): ProjectTimelineEntry[] {
  const entries: ProjectTimelineEntry[] = [];
  for (const [date, day] of Object.entries(state.days)) {
    for (const item of day.items) {
      if (item.projectPath !== projectPath) continue;
      entries.push({ date, item, abs: absoluteMinute(date, itemStart(item, day.wake)) });
    }
  }
  return entries.sort((a, b) => a.abs - b.abs || a.item.id.localeCompare(b.item.id));
}

export function projectTimelineRange(
  entries: readonly ProjectTimelineEntry[],
  branches: readonly ProjectTimelineBranch[],
  focusAbs: number
): ProjectTimelineRange {
  const marks = [focusAbs, ...entries.map(entry => entry.abs), ...branches.flatMap(branch => [branch.startAbs, branch.endAbs])];
  const first = Math.min(...marks);
  const last = Math.max(...marks);
  return { start: first - 720, end: Math.max(first + 2880, last + 720) };
}

export function projectBranchX(
  branchId: string | null | undefined,
  branches: readonly ProjectTimelineBranch[],
  center: number,
  gap: number
): number {
  if (!branchId) return center;
  const branch = branches.find(candidate => candidate.id === branchId);
  if (!branch) return center;
  const peers = branches.filter(candidate => candidate.side === branch.side);
  const lane = Math.max(0, peers.findIndex(candidate => candidate.id === branch.id)) + 1;
  return center + branch.side * lane * gap + (branch.offsetX || 0);
}

export function pickProjectBranch(
  abs: number,
  x: number,
  branches: readonly ProjectTimelineBranch[],
  center: number,
  gap: number
): string | null {
  let picked: string | null = null;
  let distance = Math.abs(x - center);
  for (const branch of branches) {
    if (branch.merged && abs > branch.endAbs) continue;
    const next = Math.abs(x - projectBranchX(branch.id, branches, center, gap));
    if (next < distance) {
      distance = next;
      picked = branch.id;
    }
  }
  return picked;
}

export function isoWeekNumber(day: number): number {
  const date = new Date(day * 86_400_000);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

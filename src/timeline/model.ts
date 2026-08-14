import type { TimelineBranch, TimelineDayState, TimelineItem } from "../types";

export const TIMELINE_TOP = 54;
export const TIMELINE_BOTTOM = 84;
export const MIN_SCALE = 0.55;
export const MAX_SCALE = 4;
export const SNAP_MINUTES = 5;

export interface BranchLayout {
  branch: TimelineBranch;
  lane: number;
  x: number;
  endMin: number;
}

export interface TimelineLayout {
  width: number;
  center: number;
  height: number;
  scale: number;
  branches: Map<string, BranchLayout>;
}

export function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function snapMinute(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function clampMinute(day: TimelineDayState, minutes: number): number {
  return Math.max(day.wake, Math.min(day.sleep, minutes));
}

export function minuteToY(day: TimelineDayState, scale: number, minutes: number): number {
  return (minutes - day.wake) * scale + TIMELINE_TOP;
}

export function yToMinute(day: TimelineDayState, scale: number, y: number): number {
  return clampMinute(day, snapMinute((y - TIMELINE_TOP) / scale + day.wake));
}

export function itemStart(item: TimelineItem, fallback: number): number {
  return item.kind === "fact"
    ? item.startMin ?? item.endMin ?? item.plannedMin ?? fallback
    : item.startedMin ?? item.plannedMin ?? item.startMin ?? fallback;
}

export function itemEnd(item: TimelineItem, fallback: number, nowMinute?: number): number {
  if (item.factTiming && nowMinute != null) return Math.max(itemStart(item, fallback), nowMinute);
  if (item.kind === "todo" && item.startedMin != null && nowMinute != null) {
    return Math.max(item.startedMin, nowMinute);
  }
  return item.kind === "fact"
    ? item.endMin ?? item.startMin ?? item.plannedMin ?? fallback
    : itemStart(item, fallback);
}

export function itemDuration(item: TimelineItem, fallback: number, nowMinute?: number): number {
  return Math.max(0, itemEnd(item, fallback, nowMinute) - itemStart(item, fallback));
}

export function backfillItem(item: TimelineItem, fallbackEnd: number, minutes: number, lowerBound: number): void {
  const duration = Math.max(1, Math.round(minutes));
  const end = item.kind === "fact" && !item.factTiming
    ? item.endMin ?? item.startMin ?? item.plannedMin ?? fallbackEnd
    : fallbackEnd;
  item.kind = "fact";
  item.startMin = Math.max(lowerBound, end - duration);
  item.endMin = end;
  item.factTiming = false;
  delete item.startedMin;
}

export function effectiveBranchEnd(day: TimelineDayState, branch: TimelineBranch, nowMinute?: number): number {
  if (branch.endMin != null) return Math.max(branch.startMin + 30, branch.endMin);
  let end = branch.startMin + 45;
  for (const item of day.items) {
    if (item.branchId === branch.id) end = Math.max(end, itemEnd(item, day.wake, nowMinute) + 25);
  }
  if (nowMinute != null) end = Math.max(end, nowMinute);
  return Math.min(day.sleep, end);
}

export function branchStartBounds(day: TimelineDayState, branch: TimelineBranch): [number, number] {
  let upper = branch.endMin != null ? branch.endMin - 10 : day.sleep;
  for (const item of day.items) {
    if (item.branchId === branch.id) upper = Math.min(upper, itemStart(item, day.wake) - 5);
  }
  return [day.wake, Math.max(day.wake, upper)];
}

export function computeTimelineLayout(
  day: TimelineDayState,
  width: number,
  scale: number,
  nowMinute?: number
): TimelineLayout {
  const center = width / 2;
  const branches = new Map<string, BranchLayout>();
  const laneGap = Math.max(112, Math.min(158, width * 0.34));

  for (const side of [-1, 1] as const) {
    const laneEnds: number[] = [];
    const list = day.branches
      .filter(branch => branch.side === side)
      .sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
    for (const branch of list) {
      const endMin = effectiveBranchEnd(day, branch, nowMinute);
      let lane = laneEnds.findIndex(end => end <= branch.startMin);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = endMin;
      branches.set(branch.id, {
        branch,
        lane,
        x: side * laneGap * (lane + 1) + (branch.offsetX || 0),
        endMin
      });
    }
  }

  return {
    width,
    center,
    height: minuteToY(day, scale, day.sleep) + TIMELINE_BOTTOM,
    scale,
    branches
  };
}

export function itemX(item: TimelineItem, layout: TimelineLayout): number {
  return item.branchId ? layout.branches.get(item.branchId)?.x || 0 : 0;
}

export function pickBranch(layout: TimelineLayout, minute: number, x: number): string | null {
  let picked: string | null = null;
  let distance = Math.abs(x);
  for (const entry of layout.branches.values()) {
    if (minute < entry.branch.startMin || minute > entry.endMin) continue;
    const next = Math.abs(x - entry.x);
    if (next < distance) {
      distance = next;
      picked = entry.branch.id;
    }
  }
  return picked;
}

export function branchPath(day: TimelineDayState, layout: TimelineLayout, entry: BranchLayout, x = entry.x): string {
  const startY = minuteToY(day, layout.scale, entry.branch.startMin);
  const endY = minuteToY(day, layout.scale, entry.endMin);
  const branchX = layout.center + x;
  const bend = Math.min(34, Math.max(12, (endY - startY) / 2));
  let path = `M ${layout.center} ${startY} Q ${branchX} ${startY} ${branchX} ${startY + bend} L ${branchX} ${endY}`;
  if (entry.branch.endMin != null) path += ` Q ${branchX} ${endY + 30} ${layout.center} ${endY + 30}`;
  return path;
}

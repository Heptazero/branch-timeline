import type { DistractionLevel, TimelineDistraction } from "./types";

export const DISTRACTION_LEVELS: readonly { id: DistractionLevel; label: string; detail: string; weight: number }[] = [
  { id: "light", label: "轻", detail: "短暂飘走，还知道下一步", weight: 1 },
  { id: "medium", label: "中", detail: "思路断了，需要重新定位", weight: 2 },
  { id: "heavy", label: "重", detail: "已经切走或离开任务", weight: 4 }
];

export function distractionLevel(event: TimelineDistraction): DistractionLevel {
  return event.level === "medium" || event.level === "heavy" ? event.level : "light";
}

export function distractionWeight(event: TimelineDistraction): number {
  return DISTRACTION_LEVELS.find(level => level.id === distractionLevel(event))?.weight ?? 1;
}

export function distractionLabel(event: TimelineDistraction): string {
  return `${DISTRACTION_LEVELS.find(level => level.id === distractionLevel(event))?.label ?? "轻"}度走神`;
}

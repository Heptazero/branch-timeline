import type { TimelineDayState, TimelineItem } from "../types";
import { itemStart } from "./model";

export function isRunningItem(item: TimelineItem): boolean {
  return item.factTiming === true || (item.kind === "todo" && item.startedMin != null);
}

export function runningItems(day: TimelineDayState): TimelineItem[] {
  return day.items
    .filter(isRunningItem)
    .sort((left, right) => runningStart(right, day.wake) - runningStart(left, day.wake));
}

export function runningStart(item: TimelineItem, fallback: number): number {
  return item.kind === "todo"
    ? item.startedMin ?? item.plannedMin ?? fallback
    : item.startMin ?? item.endMin ?? fallback;
}

export function elapsedMinutes(item: TimelineItem, day: TimelineDayState, nowMinute: number): number {
  return Math.max(0, nowMinute - runningStart(item, day.wake));
}

export function compactDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest ? `${rest}m` : ""}`;
}

export class TimerService {
  start(day: TimelineDayState, itemId: string, now: number, uid: () => string): TimelineItem | null {
    const target = day.items.find(candidate => candidate.id === itemId);
    if (!target) return null;
    if (target.kind === "todo") {
      target.startedMin = now;
      return target;
    }
    const start = target.startMin ?? target.endMin ?? now;
    const end = target.endMin ?? start;
    if (end > start) {
      const continuation: TimelineItem = {
        ...target,
        id: uid(),
        startMin: now,
        endMin: now,
        factTiming: true,
        projectTaskId: undefined
      };
      day.items.push(continuation);
      return continuation;
    }
    target.startMin = now;
    target.endMin = now;
    target.factTiming = true;
    return target;
  }

  stop(day: TimelineDayState, itemId: string, now: number): TimelineItem | null {
    const target = day.items.find(candidate => candidate.id === itemId);
    if (!target || target.kind !== "fact" || !target.factTiming) return null;
    target.endMin = Math.max(itemStart(target, day.wake), now);
    target.factTiming = false;
    return target;
  }

  stopTodo(day: TimelineDayState, itemId: string, now: number, uid: () => string): TimelineItem | null {
    const target = day.items.find(candidate => candidate.id === itemId);
    if (!target || target.kind !== "todo" || target.startedMin == null) return null;
    const fact: TimelineItem = {
      ...target,
      id: uid(),
      kind: "fact",
      startMin: target.startedMin,
      endMin: Math.max(target.startedMin, now),
      factTiming: false,
      projectTaskId: undefined,
      milestone: false
    };
    delete fact.startedMin;
    delete target.startedMin;
    day.items.push(fact);
    return fact;
  }

  cancel(day: TimelineDayState, itemId: string): TimelineItem | null {
    const target = day.items.find(candidate => candidate.id === itemId);
    if (!target || target.kind !== "todo") return null;
    delete target.startedMin;
    return target;
  }

  complete(day: TimelineDayState, itemId: string, now: number): TimelineItem | null {
    const target = day.items.find(candidate => candidate.id === itemId);
    if (!target || target.kind !== "todo") return null;
    target.kind = "fact";
    target.startMin = target.startedMin ?? now;
    target.endMin = Math.max(target.startMin, now);
    target.factTiming = false;
    delete target.startedMin;
    return target;
  }
}

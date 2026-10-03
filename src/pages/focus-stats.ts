import { itemEnd, itemStart } from "../timeline/model";
import { isRunningItem } from "../timeline/timer-service";
import type { BranchTimelineState, TimelineDayState } from "../types";

type Span = { start: number; end: number };
export type DayPeriod = "morning" | "afternoon" | "evening";
export type FocusTotal = { minutes: number; distractions: number };

function recordedSpans(day: TimelineDayState, nowMinute?: number, projectPath?: string): Span[] {
  const spans = day.items.flatMap(item => {
    if (projectPath && item.projectPath !== projectPath) return [];
    if (item.kind !== "fact" && !isRunningItem(item)) return [];
    const start = Math.max(0, itemStart(item, day.wake));
    const end = Math.min(2880, itemEnd(item, day.wake, nowMinute));
    return end > start ? [{ start, end }] : [];
  });
  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

export function recordedMinutes(day: TimelineDayState, nowMinute?: number, projectPath?: string): number {
  return recordedSpans(day, nowMinute, projectPath).reduce((sum, span) => sum + span.end - span.start, 0);
}

export function periodAtMinute(minute: number): DayPeriod {
  const hourMinute = ((minute % 1440) + 1440) % 1440;
  return hourMinute >= 300 && hourMinute < 720 ? "morning"
    : hourMinute >= 720 && hourMinute < 1080 ? "afternoon" : "evening";
}

export function periodMinutes(day: TimelineDayState, nowMinute?: number): Record<DayPeriod, number> {
  const result = { morning: 0, afternoon: 0, evening: 0 };
  for (const span of recordedSpans(day, nowMinute)) {
    let cursor = span.start;
    while (cursor < span.end) {
      const next = [300, 720, 1080, 1740, 2160, 2520, 2880].find(boundary => boundary > cursor) ?? 2880;
      const stop = Math.min(span.end, next);
      result[periodAtMinute(cursor)] += stop - cursor;
      cursor = stop;
    }
  }
  return result;
}

export function projectFocusTotal(state: BranchTimelineState, projectPath: string, todayKey: string, nowMinute: number): FocusTotal {
  let minutes = 0;
  let distractions = 0;
  for (const [key, day] of Object.entries(state.days)) {
    minutes += recordedMinutes(day, key === todayKey ? nowMinute : undefined, projectPath);
    const projectItemIds = new Set(day.items.filter(item => item.projectPath === projectPath).map(item => item.id));
    distractions += (day.distractions || []).filter(event => event.itemId && projectItemIds.has(event.itemId)).length;
  }
  return { minutes, distractions };
}

import { itemEnd, itemStart } from "../timeline/model";
import { compactDuration, isRunningItem } from "../timeline/timer-service";
import type { BranchTimelineState, TimelineDayState } from "../types";
import { dateKey, logicalToday } from "../vault/format";

export type Span = { start: number; end: number };
export type DayPeriod = "morning" | "afternoon" | "evening";
export type FocusTotal = { minutes: number; distractions: number };

export function recordedSpans(day: TimelineDayState, nowMinute?: number, projectPath?: string): Span[] {
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

export function nowOnAxis(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
}

export function intervalLabel(total: FocusTotal): string {
  if (total.distractions) return compactDuration(Math.round(total.minutes / total.distractions));
  return total.minutes ? `≥${compactDuration(Math.round(total.minutes))}` : "–";
}

/** 近 28 天每小时记录中的顺畅度；缺少至少三天和 90 分钟观察时留空。 */
export function focusRhythm(state: BranchTimelineState, endDate: Date, nowMinute: number): (number | null)[] {
  const end = endDate < logicalToday() ? endDate : logicalToday();
  const today = dateKey(logicalToday());
  const minutes = Array<number>(24).fill(0);
  const distractions = Array<number>(24).fill(0);
  const observedDays = Array.from({ length: 24 }, () => new Set<string>());
  for (let offset = 0; offset < 28; offset++) {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset);
    const key = dateKey(date);
    const day = state.days[key];
    if (!day) continue;
    for (const span of recordedSpans(day, key === today ? nowMinute : undefined)) {
      for (let at = span.start; at < span.end;) {
        const hour = Math.floor(at / 60) % 24;
        const stop = Math.min(span.end, Math.floor(at / 60) * 60 + 60);
        minutes[hour] += stop - at;
        observedDays[hour].add(key);
        at = stop;
      }
    }
    for (const event of day.distractions || []) distractions[Math.floor(event.minute / 60) % 24]++;
  }
  return minutes.map((value, hour) => value >= 90 && observedDays[hour].size >= 3
    ? Math.exp(-distractions[hour] * 60 / value) : null);
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

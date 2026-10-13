import { itemEnd, itemStart } from "./timeline/model";
import { isRunningItem } from "./timeline/timer-service";
import type { MentalStateLabel, TimelineDayState, TimelineMentalState } from "./types";

export interface FocusSpan { start: number; end: number }

export function clampFocusScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeMentalStateLabels(value: unknown): MentalStateLabel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(label => {
    if (!label || typeof label.id !== "string" || typeof label.name !== "string" || !Number.isFinite(label.score)) return [];
    const id = label.id.trim();
    const name = label.name.trim().slice(0, 24);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, score: clampFocusScore(label.score) }];
  });
}

export function normalizeMentalStates(value: unknown, wake: number, sleep: number): TimelineMentalState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(event =>
    event && typeof event.id === "string" && Number.isFinite(event.minute) && Number.isFinite(event.score)
      ? [{ id: event.id, minute: Math.max(wake, Math.min(sleep, Math.round(event.minute))),
        score: clampFocusScore(event.score),
        ...(typeof event.label === "string" && event.label.trim() ? { label: event.label.trim().slice(0, 24) } : {}) }]
      : []);
}

/** Only actual project work supplies duration evidence; plans and point marks never do. */
export function projectFocusSpans(day: TimelineDayState, nowMinute?: number): FocusSpan[] {
  const spans = day.items.flatMap(item => {
    if (!item.projectPath || (item.kind !== "fact" && !isRunningItem(item))) return [];
    const start = Math.max(day.wake, itemStart(item, day.wake));
    const end = Math.min(day.sleep, itemEnd(item, day.wake, nowMinute));
    return end > start ? [{ start, end }] : [];
  });
  return mergeFocusSpans(spans);
}

export function mergeFocusSpans(spans: FocusSpan[]): FocusSpan[] {
  spans.sort((a, b) => a.start - b.start);
  const merged: FocusSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

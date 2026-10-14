import type { MentalStateLabel, TimelineDayState, TimelineMentalState } from "./types";

export interface FocusSpan { start: number; end: number }
export interface FocusMark { minute: number; score: number; label: string }

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

export function setMentalStateMinute(day: TimelineDayState, id: string, minute: number): void {
  const entry = day.mentalStates?.find(state => state.id === id);
  if (entry && Number.isFinite(minute)) entry.minute = Math.max(day.wake, Math.min(day.sleep, Math.round(minute)));
}

/** Actual marks are explicit observations; historical prediction is calculated separately. */
export function focusRailMarks(day: TimelineDayState): FocusMark[] {
  return [
    ...(day.distractions || []).map(event => ({ minute: event.minute, score: 0, label: "走神" })),
    ...(day.goodStates || []).map(event => ({ minute: event.minute, score: 100, label: "高度专注" })),
    ...(day.mentalStates || []).map(event => ({ minute: event.minute, score: event.score, label: event.label || "可用脑力" }))
  ];
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

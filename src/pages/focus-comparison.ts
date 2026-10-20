import { distractionWeight } from "../focus-events";
import { hoursValue } from "../time-label";
import type { TimelineDayState } from "../types";
import { burdenRate, recordedSpans, type FocusTotal, type Span } from "./focus-stats";

export type FocusSample = FocusTotal & { days: number };
export type FocusComparison = { score: number; confidence: number; baselineRate: number; currentRate: number };

export function emptyFocusSample(): FocusSample {
  return { minutes: 0, distractions: 0, load: 0, good: 0, days: 0 };
}

/** Only observed recording time contributes to the denominator or interruption burden. */
export function dayFocusSample(day: TimelineDayState, nowMinute?: number, projectPath?: string): FocusSample {
  const spans = recordedSpans(day, nowMinute, projectPath);
  const minutes = spans.reduce((sum, span) => sum + span.end - span.start, 0);
  const ids = projectPath ? new Set(day.items.filter(item => item.projectPath === projectPath).map(item => item.id)) : null;
  const belongs = (event: { minute: number; itemId?: string }) =>
    (!ids || (!!event.itemId && ids.has(event.itemId))) && containsMinute(spans, event.minute);
  const events = (day.distractions || []).filter(belongs);
  return {
    minutes, distractions: events.length,
    load: events.reduce((sum, event) => sum + distractionWeight(event), 0),
    good: (day.goodStates || []).filter(belongs).length,
    days: minutes > 0 ? 1 : 0
  };
}

export function focusSample(
  days: Readonly<Record<string, TimelineDayState>>,
  include: (key: string) => boolean,
  todayKey: string,
  nowMinute: number,
  projectPath?: string
): FocusSample {
  const total = emptyFocusSample();
  for (const [key, day] of Object.entries(days)) {
    if (!include(key)) continue;
    const sample = dayFocusSample(day, key === todayKey ? nowMinute : undefined, projectPath);
    for (const key of ["minutes", "distractions", "load", "good", "days"] as const) total[key] += sample[key];
  }
  return total;
}

/** Compare exposure-weighted rates, with two hours of baseline shrinkage for short samples. */
export function compareFocus(sample: FocusSample, baseline: FocusSample): FocusComparison {
  const baselineRate = burdenRate(baseline);
  const currentRate = burdenRate(sample);
  if (sample.minutes <= 0 || baseline.minutes <= 0) return { score: .5, confidence: 0, baselineRate, currentRate };
  const baselinePerMinute = baseline.load / baseline.minutes;
  const adjustedRate = (sample.load + baselinePerMinute * 120) / (sample.minutes + 120) * 60;
  const combined = baselineRate + adjustedRate;
  const relative = combined > 0 ? (baselineRate - adjustedRate) / combined : 0;
  const confidence = Math.sqrt(sample.minutes / (sample.minutes + 120) * baseline.minutes / (baseline.minutes + 600));
  return { score: .5 + relative * confidence * .46, confidence, baselineRate, currentRate };
}

export function interruptionInterval(total: FocusTotal): number | null {
  return total.minutes > 0 && total.distractions > 0 ? total.minutes / total.distractions : null;
}

export function focusHours(minutes: number): string {
  return `${hoursValue(minutes)}h`;
}

function containsMinute(spans: readonly Span[], minute: number): boolean {
  return spans.some(span => minute >= span.start && minute <= span.end);
}

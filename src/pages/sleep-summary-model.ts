import type { BranchTimelineState } from "../types";
import { focusHours } from "./focus-comparison";
import { sleepSpan, type SleepSpan } from "./time-map";

type Change = { text: string; tone: "is-good" | "is-bad" | "is-neutral" };
export type SleepMetric = { label: string; value: string; change: Change | null };

export function sleepWeekMetrics(dates: readonly Date[], state: BranchTimelineState, previousDates?: readonly Date[]): SleepMetric[] {
  const previous = previousDates ?? dates.map(date => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7));
  const spans = (range: readonly Date[]) => range.map(date => sleepSpan(date, state)).filter((span): span is SleepSpan => !!span);
  const current = spans(dates);
  const lastWeek = spans(previous);
  return [
    { label: "平均入睡", value: current.length ? timeLabel(average(current.map(span => span.bed))) : "–", change: change(current, lastWeek, "bed") },
    { label: "平均起床", value: current.length ? timeLabel(average(current.map(span => span.wake))) : "–", change: change(current, lastWeek, "wake") },
    { label: "平均睡眠", value: current.length ? focusHours(average(current.map(span => span.duration))) : "–", change: change(current, lastWeek, "duration") }
  ];
}

function change(current: readonly SleepSpan[], previous: readonly SleepSpan[], key: "bed" | "wake" | "duration"): Change | null {
  if (!current.length || !previous.length) return null;
  const difference = Math.round(average(current.map(span => span[key])) - average(previous.map(span => span[key])));
  if (Math.abs(difference) < 5) return { text: "±0m", tone: "is-neutral" };
  const tone = key === "wake" ? "is-neutral"
    : key === "bed" ? (difference < 0 ? "is-good" : "is-bad") : difference > 0 ? "is-good" : "is-bad";
  return { text: (difference > 0 ? "+" : "−") + Math.abs(difference) + "m", tone };
}

function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function timeLabel(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return String(Math.floor(normalized / 60)).padStart(2, "0") + ":" + String(normalized % 60).padStart(2, "0");
}

import { distractionWeight } from "./focus-events";
import { mergeFocusSpans, type FocusSpan } from "./focus-state-model";
import { itemEnd, itemStart } from "./timeline/model";
import type { TimelineDayState } from "./types";

export interface FocusPredictionPoint {
  minute: number;
  score: number;
  evidenceDays: number;
  ready: boolean;
}

export interface FocusPrediction {
  days: number;
  points: FocusPredictionPoint[];
}

const LOOKBACK_DAYS = 42;
const RECENCY_HALF_LIFE = 21;
const MIN_DAYS = 7;
const MIN_LOCAL_DAYS = 4;
const FIRST_MINUTE = 120;
const LAST_MINUTE = 1800;
const STEP_MINUTES = 15;

interface DayEvidence { day: TimelineDayState; spans: FocusSpan[]; age: number }

/** A time-of-day tendency, using completed days only. Missing activity is neutral, not negative. */
export function predictFocusByTime(days: Record<string, TimelineDayState>, targetKey: string): FocusPrediction {
  const targetDay = utcDay(targetKey);
  if (targetDay == null) return { days: 0, points: [] };
  const history: DayEvidence[] = [];
  for (const [key, day] of Object.entries(days)) {
    const date = utcDay(key);
    if (date == null) continue;
    const age = Math.round((targetDay - date) / 86_400_000);
    if (age < 1 || age > LOOKBACK_DAYS) continue;
    const spans = projectSpans(day);
    if (!spans.length && !day.distractions?.length && !day.goodStates?.length && !day.mentalStates?.length) continue;
    history.push({ day, spans, age });
  }
  const points: FocusPredictionPoint[] = [];
  for (let minute = FIRST_MINUTE; minute <= LAST_MINUTE; minute += STEP_MINUTES) {
    let total = 0;
    let weightTotal = 0;
    let evidenceDays = 0;
    for (const entry of history) {
      const weight = 2 ** (-entry.age / RECENCY_HALF_LIFE);
      const samples = [minute - 15, minute, minute + 15];
      const score = (dayScore(entry, samples[0]) + 2 * dayScore(entry, samples[1]) + dayScore(entry, samples[2])) / 4;
      total += score * weight;
      weightTotal += weight;
      if (hasLocalEvidence(entry, minute)) evidenceDays++;
    }
    points.push({
      minute,
      score: weightTotal ? total / weightTotal : .5,
      evidenceDays,
      ready: history.length >= MIN_DAYS && evidenceDays >= MIN_LOCAL_DAYS
    });
  }
  return { days: history.length, points };
}

function projectSpans(day: TimelineDayState): FocusSpan[] {
  return mergeFocusSpans(day.items.flatMap(item => {
    if (item.kind !== "fact" || !item.projectPath) return [];
    const start = itemStart(item, day.wake);
    const end = itemEnd(item, day.wake);
    return end > start ? [{ start, end }] : [];
  }));
}

function dayScore(entry: DayEvidence, minute: number): number {
  const start = minute - 15;
  const end = minute + 15;
  const active = entry.spans.reduce((sum, span) => sum + Math.max(0, Math.min(end, span.end) - Math.max(start, span.start)), 0) / 30;
  let score = .5 + .22 * Math.min(1, active);
  const distractionLoad = (entry.day.distractions || []).reduce((sum, event) =>
    sum + distractionWeight(event) * gaussian(minute - event.minute, 22), 0);
  score -= Math.min(.28, .045 * distractionLoad);
  for (const event of entry.day.goodStates || []) {
    score += (.94 - score) * .75 * gaussian(minute - event.minute, 22);
  }
  for (const event of entry.day.mentalStates || []) {
    score += (event.score / 100 - score) * .9 * gaussian(minute - event.minute, 22);
  }
  return Math.max(0, Math.min(1, score));
}

function hasLocalEvidence(entry: DayEvidence, minute: number): boolean {
  if (entry.spans.some(span => span.start <= minute + 45 && span.end >= minute - 45)) return true;
  return [...(entry.day.distractions || []), ...(entry.day.goodStates || []), ...(entry.day.mentalStates || [])]
    .some(event => Math.abs(event.minute - minute) <= 45);
}

function gaussian(distance: number, width: number): number {
  return Math.exp(-.5 * (distance / width) ** 2);
}

function utcDay(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = Date.UTC(year, month - 1, day);
  const parsed = new Date(date);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? date : null;
}

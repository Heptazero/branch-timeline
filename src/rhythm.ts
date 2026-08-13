import type { RhythmKey, RhythmSchedule, TimelineDayState } from "./types";

export const DEFAULT_RHYTHM: RhythmSchedule = {
  wake: 7 * 60,
  napStart: 14 * 60,
  napEnd: 14 * 60 + 30,
  sleepPrep: 25 * 60,
  sleep: 26 * 60
};

export const RHYTHM_KEYS: readonly RhythmKey[] = ["wake", "napStart", "napEnd", "sleepPrep", "sleep"];

export function rhythmLabel(key: RhythmKey): string {
  if (key === "wake") return "起床";
  if (key === "napStart") return "午休开始";
  if (key === "napEnd") return "午休结束";
  if (key === "sleepPrep") return "睡眠准备";
  return "入睡";
}

export function rhythmRealKey(key: RhythmKey): "wakeReal" | "napStartReal" | "napEndReal" | "sleepPrepReal" | "sleepReal" {
  return `${key}Real` as ReturnType<typeof rhythmRealKey>;
}

export function normalizeRhythmSchedule(value?: Partial<RhythmSchedule>, legacyWake?: number, legacySleep?: number): RhythmSchedule {
  const wake = finite(value?.wake, finite(legacyWake, DEFAULT_RHYTHM.wake));
  const sleep = finite(value?.sleep, finite(legacySleep, DEFAULT_RHYTHM.sleep));
  const napStart = finite(value?.napStart, DEFAULT_RHYTHM.napStart);
  const napEnd = finite(value?.napEnd, Math.max(napStart + 5, DEFAULT_RHYTHM.napEnd));
  const sleepPrep = finite(value?.sleepPrep, Math.max(napEnd + 30, sleep - 60));
  return orderedSchedule({ wake, napStart, napEnd, sleepPrep, sleep });
}

export function normalizeTimelineDay(value: Partial<TimelineDayState>): TimelineDayState {
  const wake = finite(value.wake, DEFAULT_RHYTHM.wake);
  const sleep = finite(value.sleep, DEFAULT_RHYTHM.sleep);
  const legacyPivot = finite(value.pivot, DEFAULT_RHYTHM.napStart);
  const napStart = finite(value.napStart, legacyPivot);
  const napEnd = finite(value.napEnd, napStart + 30);
  const sleepPrep = finite(value.sleepPrep, Math.max(napEnd + 30, sleep - 60));
  const schedule = orderedSchedule({ wake, napStart, napEnd, sleepPrep, sleep });
  return {
    ...value,
    ...schedule,
    wakeReal: !!value.wakeReal,
    napStartReal: !!(value.napStartReal ?? value.pivotReal),
    napEndReal: !!value.napEndReal,
    sleepPrepReal: !!value.sleepPrepReal,
    sleepReal: !!value.sleepReal,
    branches: Array.isArray(value.branches) ? value.branches : [],
    items: Array.isArray(value.items) ? value.items : []
  };
}

export function rhythmBounds(schedule: RhythmSchedule | TimelineDayState, key: RhythmKey): [number, number] {
  if (key === "wake") return [0, Math.max(0, schedule.napStart - 30)];
  if (key === "napStart") return [schedule.wake + 30, schedule.napEnd - 5];
  if (key === "napEnd") return [schedule.napStart + 5, schedule.sleepPrep - 30];
  if (key === "sleepPrep") return [schedule.napEnd + 30, schedule.sleep - 5];
  return [schedule.sleepPrep + 5, 28 * 60];
}

export function updateRhythmSchedule(schedule: RhythmSchedule, key: RhythmKey, minute: number): RhythmSchedule {
  const [lower, upper] = rhythmBounds(schedule, key);
  return orderedSchedule({ ...schedule, [key]: Math.max(lower, Math.min(upper, minute)) });
}

export function countdownToSleepPrep(schedule: RhythmSchedule, now: Date): { minutes: number; elapsed: boolean } {
  const nowMinute = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  const minutes = schedule.sleepPrep - nowMinute;
  return { minutes: Math.abs(minutes), elapsed: minutes < 0 };
}

export function countdownLabel(schedule: RhythmSchedule, now: Date): string {
  const value = countdownToSleepPrep(schedule, now);
  const hours = Math.floor(value.minutes / 60);
  const minutes = value.minutes % 60;
  return `${value.elapsed ? "+" : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function orderedSchedule(value: RhythmSchedule): RhythmSchedule {
  const wake = clamp(value.wake, 0, 24 * 60);
  const napStart = clamp(value.napStart, wake + 30, 24 * 60);
  const napEnd = clamp(value.napEnd, napStart + 5, 25 * 60);
  const sleepPrep = clamp(value.sleepPrep, napEnd + 30, 28 * 60 - 5);
  const sleep = clamp(value.sleep, sleepPrep + 5, 28 * 60);
  return { wake, napStart, napEnd, sleepPrep, sleep };
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

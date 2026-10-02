import type {
  RhythmBoundaryKey,
  RhythmKey,
  RhythmMarkerDefinition,
  RhythmSchedule,
  TimelineDayState,
  TimelineRhythmMarker
} from "./types";
import { normalizeEnergyPhases } from "./timeline/energy-phases";

export const DEFAULT_RHYTHM: RhythmSchedule = {
  wake: 7 * 60,
  napStart: 14 * 60,
  napEnd: 14 * 60 + 30,
  sleepPrep: 25 * 60,
  sleep: 26 * 60
};

export const RHYTHM_KEYS: readonly RhythmKey[] = ["wake", "napStart", "napEnd", "sleepPrep", "sleep"];
export const RHYTHM_BOUNDARIES: readonly RhythmBoundaryKey[] = ["wake", "sleep"];
export const DEFAULT_RHYTHM_MARKERS: readonly RhythmMarkerDefinition[] = [
  { id: "nap-start", name: "午休开始", minute: DEFAULT_RHYTHM.napStart },
  { id: "nap-end", name: "午休结束", minute: DEFAULT_RHYTHM.napEnd }
];

export function rhythmLabel(key: RhythmKey, labels?: Partial<Record<RhythmKey, string>>): string {
  if (labels?.[key]) return labels[key]!;
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

export function normalizeRhythmMarkers(
  value: readonly RhythmMarkerDefinition[] | undefined,
  schedule: RhythmSchedule,
  labels?: Partial<Record<RhythmKey, string>>
): RhythmMarkerDefinition[] {
  const source = Array.isArray(value) ? value : [
    { id: "nap-start", name: rhythmLabel("napStart", labels), minute: schedule.napStart },
    { id: "nap-end", name: rhythmLabel("napEnd", labels), minute: schedule.napEnd }
  ];
  const seen = new Set<string>();
  return source.flatMap(marker => {
    const id = typeof marker?.id === "string" ? marker.id.trim() : "";
    const name = typeof marker?.name === "string" ? marker.name.trim() : "";
    if (!id || !name || seen.has(id) || !Number.isFinite(marker.minute)) return [];
    seen.add(id);
    return [{ id, name, minute: clamp(Math.round(marker.minute), schedule.wake + 5, schedule.sleep - 5) }];
  }).sort((left, right) => left.minute - right.minute);
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
    rhythmMarkers: normalizeDayMarkers(value, schedule),
    distractions: Array.isArray(value.distractions) ? value.distractions.flatMap(event =>
      typeof event?.id === "string" && Number.isFinite(event.minute)
        ? [{ id: event.id, minute: clamp(Math.round(event.minute), schedule.wake, schedule.sleep),
          ...(typeof event.itemId === "string" ? { itemId: event.itemId } : {}) }]
        : []) : [],
    branches: Array.isArray(value.branches) ? value.branches : [],
    items: Array.isArray(value.items) ? value.items : [],
    energyPhases: Array.isArray(value.energyPhases) ? normalizeEnergyPhases(value.energyPhases) : undefined
  };
}

export function rhythmMarkerMinute(day: TimelineDayState, definition: RhythmMarkerDefinition): number {
  return day.rhythmMarkers?.find(marker => marker.id === definition.id)?.minute ?? definition.minute;
}

export function rhythmMarkerReal(day: TimelineDayState, id: string): boolean {
  return !!day.rhythmMarkers?.find(marker => marker.id === id)?.real;
}

export function rhythmMarkerBounds(
  day: TimelineDayState,
  definitions: readonly RhythmMarkerDefinition[],
  id: string
): [number, number] {
  const ordered = definitions
    .map(definition => ({ id: definition.id, minute: rhythmMarkerMinute(day, definition) }))
    .sort((left, right) => left.minute - right.minute);
  const index = ordered.findIndex(marker => marker.id === id);
  if (index < 0) return [day.wake + 5, day.sleep - 5];
  return [
    index > 0 ? ordered[index - 1].minute + 5 : day.wake + 5,
    index < ordered.length - 1 ? ordered[index + 1].minute - 5 : day.sleep - 5
  ];
}

export function rhythmBoundaryBounds(
  schedule: Pick<RhythmSchedule, "wake" | "sleep">,
  key: RhythmBoundaryKey,
  markers: readonly RhythmMarkerDefinition[]
): [number, number] {
  if (key === "wake") return [0, Math.min(schedule.sleep - 30, ...markers.map(marker => marker.minute - 5), 24 * 60)];
  return [Math.max(schedule.wake + 30, ...markers.map(marker => marker.minute + 5)), 28 * 60];
}

export function updateRhythmSchedule(
  schedule: RhythmSchedule,
  key: RhythmBoundaryKey,
  minute: number,
  markers: readonly RhythmMarkerDefinition[] = []
): RhythmSchedule {
  const [lower, upper] = rhythmBoundaryBounds(schedule, key, markers);
  return orderedSchedule({ ...schedule, [key]: clamp(minute, lower, upper) });
}

export function updateRhythmMarker(
  markers: readonly RhythmMarkerDefinition[],
  id: string,
  minute: number,
  schedule: Pick<RhythmSchedule, "wake" | "sleep">
): RhythmMarkerDefinition[] {
  const ordered = [...markers].sort((left, right) => left.minute - right.minute);
  const index = ordered.findIndex(marker => marker.id === id);
  if (index < 0) return ordered;
  const lower = index > 0 ? ordered[index - 1].minute + 5 : schedule.wake + 5;
  const upper = index < ordered.length - 1 ? ordered[index + 1].minute - 5 : schedule.sleep - 5;
  ordered[index] = { ...ordered[index], minute: clamp(minute, lower, upper) };
  return ordered;
}

export function countdownToSleepPrep(schedule: RhythmSchedule, now: Date): { minutes: number; elapsed: boolean } {
  const minutes = schedule.sleep - logicalMinute(now);
  return { minutes: Math.abs(minutes), elapsed: minutes < 0 };
}

export function countdownLabel(schedule: RhythmSchedule, now: Date): string {
  const value = countdownToSleepPrep(schedule, now);
  return `${value.elapsed ? "+" : ""}${durationLabel(value.minutes)}`;
}

export function rhythmProgress(
  schedule: RhythmSchedule,
  now: Date,
  markers: readonly RhythmMarkerDefinition[] = DEFAULT_RHYTHM_MARKERS
): { minutes: number; mode: "elapsed" | "remaining" } {
  const nowMinute = logicalMinute(now);
  const switchAt = markers.find(marker => marker.id === "nap-end")?.minute ?? Math.round((schedule.wake + schedule.sleep) / 2);
  return nowMinute < switchAt
    ? { minutes: Math.max(0, nowMinute - schedule.wake), mode: "elapsed" }
    : { minutes: Math.max(0, schedule.sleep - nowMinute), mode: "remaining" };
}

export function rhythmProgressLabel(schedule: RhythmSchedule, now: Date, markers?: readonly RhythmMarkerDefinition[]): string {
  return durationLabel(rhythmProgress(schedule, now, markers).minutes);
}

function normalizeDayMarkers(value: Partial<TimelineDayState>, schedule: RhythmSchedule): TimelineRhythmMarker[] {
  if (Array.isArray(value.rhythmMarkers)) {
    return value.rhythmMarkers.flatMap(marker => typeof marker?.id === "string" && Number.isFinite(marker.minute)
      ? [{ id: marker.id, minute: clamp(Math.round(marker.minute), schedule.wake + 5, schedule.sleep - 5), real: !!marker.real }]
      : []);
  }
  return [
    { id: "nap-start", minute: schedule.napStart, real: !!(value.napStartReal ?? value.pivotReal) },
    { id: "nap-end", minute: schedule.napEnd, real: !!value.napEndReal }
  ];
}

function orderedSchedule(value: RhythmSchedule): RhythmSchedule {
  const wake = clamp(value.wake, 0, 24 * 60);
  const sleep = clamp(value.sleep, wake + 30, 28 * 60);
  const napStart = clamp(value.napStart, wake + 5, sleep - 10);
  const napEnd = clamp(value.napEnd, napStart + 5, sleep - 5);
  const sleepPrep = clamp(value.sleepPrep, wake + 5, sleep - 5);
  return { wake, napStart, napEnd, sleepPrep, sleep };
}

function logicalMinute(now: Date): number {
  return now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
}

function durationLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

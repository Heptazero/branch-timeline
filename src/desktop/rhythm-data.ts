import type { BranchTimelineSettings, BranchTimelineState } from "../types";
import { normalizeSettings } from "../settings-state";
import { normalizeTimelineDay, rhythmLabel, rhythmMarkerMinute, rhythmMarkerReal } from "../rhythm";
import { readSharedState } from "./shared-session";
import { dateKey, logicalToday } from "../vault/format";

export function nativeRhythm(text: string, settingsText: string, selected: string, nowText: string) {
  const state = readSharedState(text), settings = normalizeSettings(JSON.parse(settingsText)), now = new Date(nowText);
  return projectRhythm(state as unknown as BranchTimelineState, settings, selected, now);
}
export function projectRhythm(state: Pick<BranchTimelineState, "days">, settings: BranchTimelineSettings, selected: string, now: Date) {
  const day = normalizeTimelineDay(state.days[selected] || settings.rhythm);
  const events = [{ id: "wake", name: rhythmLabel("wake", settings.rhythmLabels), minute: day.wake, real: !!day.wakeReal },
    ...settings.rhythmMarkers.map(marker => ({ id: marker.id, name: marker.name, minute: rhythmMarkerMinute(day, marker), real: rhythmMarkerReal(day, marker.id) })),
    { id: "sleep", name: rhythmLabel("sleep", settings.rhythmLabels), minute: day.sleep, real: !!day.sleepReal }];
  const today = normalizeTimelineDay(state.days[dateKey(logicalToday(now))] || settings.rhythm);
  const nap = settings.rhythmMarkers.find(marker => marker.id === "nap-end");
  return { events, summary: { wake: today.wakeReal ? today.wake : settings.rhythm.wake, sleep: today.sleepReal ? today.sleep : settings.rhythm.sleep,
    switchAt: nap ? (rhythmMarkerReal(today, nap.id) ? rhythmMarkerMinute(today, nap) : nap.minute) : Math.round((settings.rhythm.wake + settings.rhythm.sleep) / 2),
    elapsedMark: settings.rhythmElapsedMark, remainingMark: settings.rhythmRemainingMark } };
}
export function nativeSetRhythm(text: string, settingsText: string, selected: string, id: string, minute: number | null, nowText: string): string {
  const state = readSharedState(text), settings = normalizeSettings(JSON.parse(settingsText));
  const parsed = new Date(selected + "T12:00:00"), now = new Date(nowText);
  if (dateKey(parsed) !== selected || !Number.isFinite(now.getTime())) throw new Error("日期无效");
  if (minute != null && (!Number.isFinite(minute) || minute < 120 || minute > 1560)) throw new Error("时间须在当日 02:00 至次日 02:00 之间");
  const day = state.days[selected] ||= normalizeTimelineDay(settings.rhythm);
  const isToday = selected === dateKey(logicalToday(now));
  const clock = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  if (id === "wake" || id === "sleep") {
    const real = id === "wake" ? "wakeReal" : "sleepReal";
    if (minute == null && day[real]) day[real] = false;
    else { if (minute != null || isToday) day[id] = minute ?? clock; day[real] = true; }
  } else {
    const definition = settings.rhythmMarkers.find(marker => marker.id === id); if (!definition) throw new Error("节律节点已删除");
    let marker = day.rhythmMarkers?.find(value => value.id === id);
    if (!marker) { marker = { id, minute: definition.minute, real: false }; (day.rhythmMarkers ||= []).push(marker); }
    if (minute == null && marker.real) marker.real = false;
    else { if (minute != null || isToday) marker.minute = minute ?? clock; marker.real = true; }
  }
  return JSON.stringify(state);
}

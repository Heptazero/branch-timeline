import type { BranchTimelineState } from "../types";
import { DEFAULT_RHYTHM } from "../rhythm";
import { dateKey, logicalToday } from "../vault/format";
import { nativeItems, nativeDayProjects, type NativeProject } from "./period-data";
import { desktopEntries, parseDesktopSession } from "./session-model";
import { readSharedState } from "./shared-session";
import { projectTimeSummary, projectRangeDates, type ProjectTimeScope } from "../pages/project-time";
import { scopeExpectedFraction, setProjectGoal } from "../pages/project-goals";
import { focusSample, interruptionInterval } from "../pages/focus-comparison";
import { startOfWeek } from "../pages/navigation";
import { sleepSpan } from "../pages/time-map";
import { recordedMinutes } from "../pages/focus-stats";
import { sleepWeekMetrics } from "../pages/sleep-summary-model";

/** Read-only projection: reuse the plugin's time, goal and sleep semantics. */
export function nativeDashboard(stateText: string, catalogText: string, selected: string, scope: ProjectTimeScope, nowText: string): string {
  const state = readSharedState(stateText) as unknown as BranchTimelineState;
  state.projects ||= {};
  const now = new Date(nowText), date = parseDate(selected);
  if (!Number.isFinite(now.getTime()) || !["day", "week", "month", "total"].includes(scope)) throw new Error("统计范围无效");
  includeActive(state, now);
  const catalog = JSON.parse(catalogText) as NativeProject[];
  const week = startOfWeek(date), dates = projectRangeDates(date, scope);
  const first = dateKey(dates[0]), last = dateKey(dates.at(-1)!), today = dateKey(logicalToday(now));
  const minute = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  const include = (key: string) => scope === "total" || (scope === "day" ? key === selected : key >= first && key <= last);
  const totals = focusSample(state.days, include, today, minute);
  const projects = catalog.map(project => {
    const sample = focusSample(state.days, include, today, minute, project.path);
    const summary = projectTimeSummary(state, project.path, date, scope, minute);
    return { ...project, actual: summary.actual, planned: summary.planned, distractions: sample.distractions, interval: interruptionInterval(sample) };
  });
  const day = state.days[selected];
  const activeId = (state as unknown as { macTimer?: { active?: { id: string } } }).macTimer?.active?.id;
  const items = nativeItems(day, activeId, selected === today ? minute : undefined);
  const days = dates.map(date => {
    const key = dateKey(date), sample = focusSample(state.days, value => value === key, today, minute), sleep = sleepSpan(date, state);
    return { date: key, minutes: sample.minutes, distractions: sample.distractions, bed: sleep?.bed ?? null, wake: sleep?.wake ?? null,
      projects: nativeDayProjects(state.days[key], catalog, key === today ? minute : undefined),
      items: nativeItems(state.days[key], activeId, key === today ? minute : undefined) };
  });
  const previous = scope === "month" ? projectRangeDates(new Date(date.getFullYear(), date.getMonth() - 1, 1), "month")
    : dates.map(value => new Date(value.getFullYear(), value.getMonth(), value.getDate() - (scope === "day" ? 1 : 7)));
  return JSON.stringify({ date: selected, weekStart: dateKey(week), weekEnd: dateKey(new Date(week.getFullYear(), week.getMonth(), week.getDate() + 6)), totalMinutes: totals.minutes,
    expected: scopeExpectedFraction(date, scope, now), projects, items, branches: (day?.branches || []).map(branch => ({ id: branch.id, name: branch.name })),
    days, sleep: sleepWeekMetrics(dates, state, previous) });
}

export function nativeSetGoal(text: string, path: string, selected: string, scope: "day" | "week" | "month", minutes: number): string {
  const state = readSharedState(text) as unknown as BranchTimelineState;
  parseDate(selected);
  if (!path || !["day", "week", "month"].includes(scope) || !Number.isFinite(minutes) || minutes < 0 || minutes > (scope === "month" ? 31 : 7) * 24 * 60) throw new Error("目标时长无效");
  state.projects ||= {};
  setProjectGoal(state, path, selected, scope, minutes);
  return JSON.stringify(state);
}

function parseDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("日期无效");
  const [year, month, day] = key.split("-").map(Number), date = new Date(year, month - 1, day);
  if (dateKey(date) !== key) throw new Error("日期无效");
  return date;
}

function includeActive(state: BranchTimelineState, now: Date): void {
  const active = (state as unknown as { macTimer?: { active?: Record<string, unknown> } }).macTimer?.active;
  if (!active) return;
  const segments = active.segments as Array<{ start: string; end?: string }>;
  const endedAt = segments.at(-1)?.end || now.toISOString();
  const session = parseDesktopSession(JSON.stringify({ ...active, endedAt,
    segments: segments.map(segment => ({ ...segment, end: segment.end || now.toISOString() })) }));
  for (const entry of desktopEntries(session)) {
    const day = state.days[entry.date] ||= { ...DEFAULT_RHYTHM, branches: [], items: [] };
    if (day.items.some(item => item.id === entry.item.id)) continue;
    day.items.push(entry.item);
    (day.distractions ||= []).push(...entry.distractions);
    (day.goodStates ||= []).push(...entry.goodStates);
  }
}

/** Compact heatmap projection: no data writes, including the active timer only once. */
export function nativeCalendar(text: string, monthKey: string, nowText: string): string {
  const state = readSharedState(text) as unknown as BranchTimelineState;
  const month = parseDate(monthKey), now = new Date(nowText);
  if (!Number.isFinite(now.getTime())) throw new Error("日期无效");
  includeActive(state, now);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = ((first.getDay() || 7) - 1), today = dateKey(logicalToday(now));
  const minute = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  return JSON.stringify(Array.from({ length: 42 }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i), key = dateKey(date);
    return { date: key, minutes: state.days[key] ? recordedMinutes(state.days[key], key === today ? minute : undefined) : 0 };
  }));
}

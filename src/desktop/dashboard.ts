import type { BranchTimelineState } from "../types";
import { DEFAULT_RHYTHM } from "../rhythm";
import { dateKey, logicalToday } from "../vault/format";
import { itemStart, itemEnd } from "../timeline/model";
import { desktopEntries, parseDesktopSession } from "./session-model";
import { readSharedState } from "./shared-session";
import { projectTimeSummary, type ProjectTimeScope } from "../pages/project-time";
import { scopeExpectedFraction, setProjectGoal } from "../pages/project-goals";
import { focusSample, interruptionInterval } from "../pages/focus-comparison";
import { startOfWeek } from "../pages/navigation";
import { sleepSpan } from "../pages/time-map";
import { sleepWeekMetrics } from "../pages/sleep-summary-model";

/** Read-only projection: reuse the plugin's time, goal and sleep semantics. */
export function nativeDashboard(stateText: string, catalogText: string, selected: string, scope: ProjectTimeScope, nowText: string): string {
  const state = readSharedState(stateText) as unknown as BranchTimelineState;
  state.projects ||= {};
  const now = new Date(nowText), date = parseDate(selected);
  if (!Number.isFinite(now.getTime()) || !["day", "week", "total"].includes(scope)) throw new Error("统计范围无效");
  includeActive(state, now);
  const catalog = JSON.parse(catalogText) as Array<{ path: string; name: string; color: string; status: string }>;
  const week = startOfWeek(date), dates = Array.from({ length: 7 }, (_, i) => new Date(week.getFullYear(), week.getMonth(), week.getDate() + i));
  const first = dateKey(dates[0]), last = dateKey(dates[6]), today = dateKey(logicalToday(now));
  const minute = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  const include = (key: string) => scope === "total" || (scope === "day" ? key === selected : key >= first && key <= last);
  const totals = focusSample(state.days, include, today, minute);
  const projects = catalog.map(project => {
    const sample = focusSample(state.days, include, today, minute, project.path);
    const summary = projectTimeSummary(state, project.path, date, scope, minute);
    return { ...project, actual: summary.actual, planned: summary.planned, distractions: sample.distractions, interval: interruptionInterval(sample) };
  });
  const day = state.days[selected];
  const items = (day?.items || []).map(item => ({ id: item.id, title: item.title, kind: item.kind, note: item.note || "",
    projectPath: item.projectPath || "", branchId: item.branchId || "", start: itemStart(item, day.wake), end: itemEnd(item, day.wake, selected === today ? minute : undefined) }));
  const days = dates.map(date => {
    const key = dateKey(date), sample = focusSample(state.days, value => value === key, today, minute), sleep = sleepSpan(date, state);
    return { date: key, minutes: sample.minutes, distractions: sample.distractions, bed: sleep?.bed ?? null, wake: sleep?.wake ?? null };
  });
  return JSON.stringify({ date: selected, weekStart: first, weekEnd: last, totalMinutes: totals.minutes,
    expected: scopeExpectedFraction(date, scope, now), projects, items, branches: (day?.branches || []).map(branch => ({ id: branch.id, name: branch.name })),
    days, sleep: sleepWeekMetrics(dates, state) });
}

export function nativeSetGoal(text: string, path: string, selected: string, scope: "day" | "week", minutes: number): string {
  const state = readSharedState(text) as unknown as BranchTimelineState;
  parseDate(selected);
  if (!path || !["day", "week"].includes(scope) || !Number.isFinite(minutes) || minutes < 0 || minutes > 7 * 24 * 60) throw new Error("目标时长无效");
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

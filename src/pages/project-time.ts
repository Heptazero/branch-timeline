import { itemDuration } from "../timeline/model";
import type { BranchTimelineState } from "../types";
import { dateKey, logicalToday } from "../vault/format";
import { startOfWeek } from "./navigation";

export type ProjectTimeScope = "day" | "week" | "total";

export interface ProjectDayTime {
  date: string;
  actual: number;
  planned: number;
}

export interface ProjectTimeSummary {
  actual: number;
  planned: number;
  days: ProjectDayTime[];
}

export function projectPlanOn(state: BranchTimelineState, path: string, date: string): number {
  const value = state.projects[path]?.dailyPlans?.[date];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function projectMinutesOn(state: BranchTimelineState, path: string, date: string, nowMinute?: number): number {
  const day = state.days[date];
  if (!day) return 0;
  return day.items.reduce((total, item) => {
    if (item.projectPath !== path) return total;
    const running = item.factTiming || (item.kind === "todo" && item.startedMin != null);
    if (item.kind !== "fact" && !running) return total;
    return total + itemDuration(item, day.wake, nowMinute);
  }, 0);
}

export function projectTimeSummary(
  state: BranchTimelineState,
  path: string,
  focusDate: Date,
  scope: ProjectTimeScope,
  nowMinute?: number
): ProjectTimeSummary {
  if (scope === "total") {
    const today = dateKey(logicalToday());
    const actual = Object.keys(state.days).reduce((total, date) =>
      total + projectMinutesOn(state, path, date, date === today ? nowMinute : undefined), 0);
    return { actual, planned: 0, days: [] };
  }
  const dates = scope === "day" ? [focusDate] : weekDates(focusDate);
  const today = dateKey(logicalToday());
  const days = dates.map(date => {
    const key = dateKey(date);
    return {
      date: key,
      actual: projectMinutesOn(state, path, key, key === today ? nowMinute : undefined),
      planned: projectPlanOn(state, path, key)
    };
  });
  return {
    actual: days.reduce((sum, day) => sum + day.actual, 0),
    planned: days.reduce((sum, day) => sum + day.planned, 0),
    days
  };
}

function weekDates(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

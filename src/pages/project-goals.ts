import type { BranchTimelineState, ProjectTimelineState } from "../types";
import { dateKey, logicalToday } from "../vault/format";
import { startOfWeek } from "./navigation";

export type ProjectGoalScope = "day" | "week";

export function projectGoalOn(
  state: BranchTimelineState,
  path: string,
  date: string,
  scope: ProjectGoalScope
): number {
  const project = state.projects[path];
  if (!project || !isGoalDateKey(date)) return 0;
  if (scope === "day") {
    return goalChangeOn(project.dailyGoalChanges, date) ?? validMinutes(project.dailyPlans?.[date]) ?? 0;
  }
  const start = startOfWeek(localDate(date));
  const explicit = goalChangeOn(project.weeklyGoalChanges, dateKey(start));
  if (explicit !== undefined) return explicit;
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return projectGoalOn(state, path, dateKey(day), "day");
  }).reduce((sum, minutes) => sum + minutes, 0);
}

/** Mutates only the selected effective-date breakpoint, preserving later changes. */
export function setProjectGoal(
  state: BranchTimelineState,
  path: string,
  date: string,
  scope: ProjectGoalScope,
  minutes: number
): void {
  if (!isGoalDateKey(date)) throw new Error("计划日期无效");
  const value = validMinutes(minutes);
  if (value === undefined) throw new Error("计划时长须为非负数字");
  const project = state.projects[path] ||= { branches: [] };
  const field = scope === "week" ? "weeklyGoalChanges" : "dailyGoalChanges";
  const key = scope === "week" ? dateKey(startOfWeek(localDate(date))) : date;
  (project[field] ||= {})[key] = value;
}

export function normalizeProjectGoals(project: Partial<ProjectTimelineState> | null | undefined): Pick<
  ProjectTimelineState, "dailyPlans" | "dailyGoalChanges" | "weeklyGoalChanges"
> {
  const result: Pick<ProjectTimelineState, "dailyPlans" | "dailyGoalChanges" | "weeklyGoalChanges"> = {};
  for (const field of ["dailyPlans", "dailyGoalChanges", "weeklyGoalChanges"] as const) {
    const source = project?.[field];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const values = Object.fromEntries(Object.entries(source).flatMap(([date, minutes]) => {
      const value = validMinutes(minutes);
      return isGoalDateKey(date) && value !== undefined ? [[date, value]] : [];
    }));
    if (Object.keys(values).length) result[field] = values;
  }
  return result;
}

/** Progress through logical days (02:00–02:00), using calendar dates across DST. */
export function scopeExpectedFraction(
  focusDate: Date,
  scope: "day" | "week" | "total",
  now = new Date()
): number {
  if (scope === "total") return 0;
  const start = scope === "week" ? startOfWeek(focusDate) : focusDate;
  const days = scope === "week" ? 7 : 1;
  const elapsedDays = calendarDayNumber(logicalToday(now)) - calendarDayNumber(start);
  const minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const fraction = ((minute - 120 + 1440) % 1440) / 1440;
  return Math.max(0, Math.min(1, (elapsedDays + fraction) / days));
}

export function weekElapsedFraction(focusDate: Date, now = new Date()): number {
  return scopeExpectedFraction(focusDate, "week", now);
}

function goalChangeOn(changes: Record<string, number> | undefined, date: string): number | undefined {
  const key = Object.keys(changes || {}).filter(key => key <= date && isGoalDateKey(key) &&
    validMinutes(changes?.[key]) !== undefined).sort().at(-1);
  return key ? validMinutes(changes?.[key]) : undefined;
}

function validMinutes(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function isGoalDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(localDate(value)) === value;
}

function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

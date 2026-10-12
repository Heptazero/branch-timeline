import type { FixedReminder, FixedReminderResult, FixedReminderRule } from "../types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MINUTE = 26 * 60 - 5;

export function normalizeFixedReminder(value: unknown): FixedReminder[] {
  if (!value || typeof value !== "object") return [];
  const source = value as Partial<FixedReminder>;
  if (typeof source.id !== "string" || !source.id || typeof source.title !== "string" || !source.title.trim() || !validDate(source.createdDate)) return [];
  const rules = Array.isArray(source.rules) ? source.rules.flatMap(normalizeRule) : [];
  if (!rules.length) return [];
  return [{ id: source.id, title: source.title.trim(), createdDate: source.createdDate,
    ...(validDate(source.archivedDate) ? { archivedDate: source.archivedDate } : {}),
    rules: rules.sort((a, b) => a.fromDate.localeCompare(b.fromDate)) }];
}

export function normalizeFixedReminderResult(value: unknown): FixedReminderResult[] {
  if (!value || typeof value !== "object") return [];
  const source = value as Partial<FixedReminderResult>;
  if (typeof source.reminderId !== "string" || !source.reminderId || !validDate(source.date)
    || (source.result !== "done" && source.result !== "missed")) return [];
  return [{ reminderId: source.reminderId, date: source.date, result: source.result,
    recordedMinute: Number.isFinite(source.recordedMinute) ? Math.max(0, Math.round(source.recordedMinute!)) : 0 }];
}

function normalizeRule(value: unknown): FixedReminderRule[] {
  if (!value || typeof value !== "object") return [];
  const source = value as Partial<FixedReminderRule>;
  if (!validDate(source.fromDate) || !Number.isFinite(source.minute) || source.minute! < 0 || source.minute! > MAX_MINUTE) return [];
  const weekdays = Array.isArray(source.weekdays)
    ? [...new Set(source.weekdays.filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort()
    : [];
  return weekdays.length ? [{ fromDate: source.fromDate, minute: Math.round(source.minute!), weekdays,
    ...(typeof source.anchorCardId === "string" && source.anchorCardId ? { anchorCardId: source.anchorCardId } : {}) }] : [];
}

export function ruleOn(reminder: FixedReminder, date: string): FixedReminderRule | undefined {
  if (!validDate(date) || date < reminder.createdDate || (reminder.archivedDate && date >= reminder.archivedDate)) return undefined;
  return reminder.rules.filter(rule => rule.fromDate <= date).at(-1);
}

export function reminderOn(reminder: FixedReminder, date: string): FixedReminderRule | undefined {
  const rule = ruleOn(reminder, date);
  return rule?.weekdays.includes(isoWeekday(date)) ? rule : undefined;
}

export function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() || 7;
}

export function reminderClock(minute: number): string {
  const value = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}${minute >= 1440 ? " · 次日" : ""}`;
}

export function reminderWeekdays(days: readonly number[]): string {
  if (days.length === 7) return "每天";
  return [...days].sort().map(day => "一二三四五六日"[day - 1]).join("·");
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(year, month - 1, day);
  return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day;
}

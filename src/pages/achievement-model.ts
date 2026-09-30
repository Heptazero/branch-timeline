import type { Achievement, AchievementRecord } from "../types";
import { dateKey } from "../vault/format";

export function normalizeAchievement(value: unknown, index = 0): Achievement {
  const source = value && typeof value === "object" ? value as Partial<Achievement> : {};
  const legacyDates = Array.isArray(source.manualDates)
    ? [...new Set(source.manualDates.filter(isDateKey))]
    : [];
  const records = Array.isArray(source.records)
    ? source.records.map(normalizeRecord).filter((record): record is AchievementRecord => !!record)
    : [];
  const existingDates = new Set(records.map(record => record.date));
  for (const date of legacyDates) {
    if (!existingDates.has(date)) records.push({ id: `legacy-${date}`, date, minute: 12 * 60, note: "" });
  }
  return {
    id: typeof source.id === "string" && source.id ? source.id : `achievement-${index}`,
    name: typeof source.name === "string" && source.name ? source.name : "未命名成就",
    color: typeof source.color === "string" && source.color ? source.color : "#3b6ea5",
    createdDate: isDateKey(source.createdDate) ? source.createdDate : dateKey(new Date()),
    records: sortAchievementRecords(records),
    manualDates: []
  };
}

export function sortAchievementRecords(records: readonly AchievementRecord[]): AchievementRecord[] {
  return [...records].sort((a, b) => recordValue(b) - recordValue(a));
}

export function achievementStats(achievement: Achievement): { total: number; current: number; latest: AchievementRecord | null } {
  const records = sortAchievementRecords(achievement.records);
  const days = [...new Set(records.map(record => record.date))].sort();
  if (!days.length) return { total: 0, current: 0, latest: null };
  const completed = new Set(days);
  let cursor = new Date(`${days.at(-1)}T12:00:00`);
  let current = 0;
  while (completed.has(dateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { total: records.length, current, latest: records[0] };
}

function normalizeRecord(value: unknown): AchievementRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<AchievementRecord>;
  if (typeof record.id !== "string" || !record.id || !isDateKey(record.date)) return null;
  const minute = Math.max(0, Math.min(1439, Math.round(Number(record.minute))));
  if (!Number.isFinite(minute)) return null;
  return { id: record.id, date: record.date, minute, note: typeof record.note === "string" ? record.note : "" };
}

function recordValue(record: AchievementRecord): number {
  return new Date(`${record.date}T00:00:00`).getTime() + record.minute * 60_000;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

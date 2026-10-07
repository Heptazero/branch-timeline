import type { LifeEvent, LifeDatePrecision } from "../types";

export interface LifeDateParts { year: number; month: number; day: number; precision: LifeDatePrecision }

export function parseLifeDate(value: string): LifeDateParts | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (year < 1000 || month < 1 || month > 12) return null;
  const actual = new Date(year, month - 1, day);
  if (day < 1 || actual.getFullYear() !== year || actual.getMonth() !== month - 1 || actual.getDate() !== day) return null;
  return { year, month, day, precision: match[3] ? "day" : match[2] ? "month" : "year" };
}

export function lifeDateValue(year: number, month: number, day: number, precision: LifeDatePrecision): string | null {
  const value = precision === "year" ? `${year}`
    : precision === "month" ? `${year}-${pad(month)}`
      : `${year}-${pad(month)}-${pad(day)}`;
  return parseLifeDate(value) ? value : null;
}

export function lifeDateLabel(value: string): string {
  const date = parseLifeDate(value);
  if (!date) return value;
  return date.precision === "year" ? `${date.year}年`
    : date.precision === "month" ? `${date.year}.${pad(date.month)}`
      : `${date.year}.${pad(date.month)}.${pad(date.day)}`;
}

export function lifeDatePosition(value: string, edge: "start" | "end" | "center" = "center"): number {
  const date = parseLifeDate(value);
  if (!date) return new Date().getFullYear();
  const start = new Date(date.year, date.month - 1, date.day);
  const end = date.precision === "year" ? new Date(date.year + 1, 0, 1)
    : date.precision === "month" ? new Date(date.year, date.month, 1)
      : new Date(date.year, date.month - 1, date.day + 1);
  const valueDate = edge === "start" ? start : edge === "end" ? end : new Date((start.getTime() + end.getTime()) / 2);
  const yearStart = new Date(valueDate.getFullYear(), 0, 1).getTime();
  const nextYear = new Date(valueDate.getFullYear() + 1, 0, 1).getTime();
  return valueDate.getFullYear() + (valueDate.getTime() - yearStart) / (nextYear - yearStart);
}

export function lifeDateAt(position: number): string {
  const year = Math.floor(position);
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const date = new Date(start + Math.max(0, Math.min(0.999999, position - year)) * (end - start));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function lifeRange(events: readonly LifeEvent[], now = new Date()): { first: number; last: number } {
  const positions = events.flatMap(event => [lifeDatePosition(event.date), event.endDate ? lifeDatePosition(event.endDate) : Infinity])
    .filter(Number.isFinite);
  return {
    first: Math.floor(Math.min(now.getFullYear() - 24, ...positions)) - 2,
    last: Math.ceil(Math.max(now.getFullYear() + 5, ...positions)) + 2
  };
}

export function clusterLifeEvents(events: readonly LifeEvent[], pixelsPerYear: number, minimumGap = 54): LifeEvent[][] {
  const sorted = events.filter(event => event.kind !== "chapter" && parseLifeDate(event.date))
    .slice().sort((a, b) => lifeDatePosition(a.date) - lifeDatePosition(b.date));
  const groups: LifeEvent[][] = [];
  for (const event of sorted) {
    const group = groups[groups.length - 1];
    if (group && (lifeDatePosition(event.date) - lifeDatePosition(group[0].date)) * pixelsPerYear < minimumGap) group.push(event);
    else groups.push([event]);
  }
  return groups;
}

function pad(value: number): string { return String(value).padStart(2, "0"); }

import type { LifeEvent } from "../types";
import { dateKey, isoWeekParts } from "../vault/format";

export interface LifeDiaryEntry extends LifeEvent {
  diaryPath: string;
  diaryLine: number;
  diaryLabel?: string;
}

export interface LifeDiaryWeek { path: string; date: string; label: string }

export function diaryWeek(path: string): LifeDiaryWeek | null {
  const match = /(?:^|\/)(\d{2})_W(\d{1,2})\.md$/.exec(path);
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(year, 0, 4 - (jan4.getDay() || 7) + 1 + (week - 1) * 7);
  const actual = isoWeekParts(monday);
  return actual.year === year && actual.week === week ? { path, date: dateKey(monday), label: `W${week}` } : null;
}

export function parseLifeDiary(content: string, week: LifeDiaryWeek, formats: readonly string[]): LifeDiaryEntry[] {
  const patterns = formats.map(compileFormat).filter((item): item is RegExp => item !== null);
  if (!patterns.length) return [];
  let currentDate: string | null = null;
  let fence: string | null = null;
  const result: LifeDiaryEntry[] = [];
  for (const [line, text] of content.split("\n").entries()) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(text);
    if (fenceMatch) { if (!fence) fence = fenceMatch[1][0]; else if (fence === fenceMatch[1][0]) fence = null; continue; }
    if (fence) continue;
    if (/^##\s+/.test(text)) currentDate = headingDate(text);
    if (!text.trim() || /^##\s+/.test(text)) continue;
    for (const pattern of patterns) {
      const matched = pattern.exec(text);
      const title = matched?.[1]?.trim();
      if (!title) continue;
      result.push({
        id: `diary:${week.path}:${line}`,
        title,
        date: currentDate || week.date,
        kind: "milestone",
        diaryPath: week.path,
        diaryLine: line,
        ...(currentDate ? {} : { diaryLabel: week.label })
      });
      break;
    }
  }
  return result;
}

export function compileFormat(format: string): RegExp | null {
  const marker = "{内容}";
  const first = format.indexOf(marker);
  if (first < 0 || format.indexOf(marker, first + marker.length) >= 0) return null;
  const before = format.slice(0, first);
  const after = format.slice(first + marker.length);
  if (!before.trim() && !after.trim()) return null;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escape(before)}(.+?)${escape(after)}\\s*$`);
}

function headingDate(text: string): string | null {
  const match = /^##\s+(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)_(\d{2})-(\d{2})-(\d{2})\s*$/.exec(text);
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? dateKey(date) : null;
}

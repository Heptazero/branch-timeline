import type { DiaryDaySnapshot } from "../types";

const DAY_NAMES = ["Sun", "Mon", "Tues", "Wednes", "Thurs", "Fri", "Satur"];

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function logicalToday(now = new Date()): Date {
  const date = new Date(now);
  if (date.getHours() < 2) date.setDate(date.getDate() - 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isoWeekParts(date: Date): { year: number; week: number } {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const year = value.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  return { year, week: Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7) };
}

export function diaryFilePath(date: Date, folder: string): string {
  const { year, week } = isoWeekParts(date);
  return `${folder.replace(/\/$/, "")}/${String(year).slice(-2)}_W${week}.md`;
}

export function diaryHeading(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}_${String(date.getFullYear()).slice(-2)}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function createWeekSkeleton(date: Date, habits: string[]): string {
  const day = date.getDay() || 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day + 1);
  const sections = Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    const tasks = habits.map(habit => `- [ ] ${habit}`).join("\n");
    return `## ${diaryHeading(current)}${tasks ? `\n${tasks}` : ""}`;
  });
  return `\n## Weekly-Summary\n${sections.map(section => `\n${section}\n`).join("")}`;
}

interface SectionRange { headingLine: number; endLine: number }

function sectionRange(lines: string[], heading: string): SectionRange | null {
  const headingLine = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (headingLine < 0) return null;
  let endLine = lines.length;
  for (let index = headingLine + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) { endLine = index; break; }
  }
  return { headingLine, endLine };
}

function ensureSection(content: string, heading: string): { lines: string[]; range: SectionRange } {
  const lines = content.split("\n");
  const existing = sectionRange(lines, heading);
  if (existing) return { lines, range: existing };
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length) lines.push("");
  lines.push(`## ${heading}`, "");
  return { lines, range: { headingLine: lines.length - 2, endLine: lines.length } };
}

export function setHabitInDiary(content: string, heading: string, habit: string, done: boolean): string {
  const { lines, range } = ensureSection(content, heading);
  const escaped = habit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^- \\[([ xX])\\] ${escaped}\\s*$`);
  for (let index = range.headingLine + 1; index < range.endLine; index += 1) {
    if (!pattern.test(lines[index])) continue;
    lines[index] = `- [${done ? "x" : " "}] ${habit}`;
    return lines.join("\n");
  }
  lines.splice(range.headingLine + 1, 0, `- [${done ? "x" : " "}] ${habit}`);
  return lines.join("\n");
}

export function appendCategoryDuration(
  content: string,
  heading: string,
  category: string,
  hours: number
): string {
  const { lines, range } = ensureSection(content, heading);
  const value = Number(hours.toFixed(2));
  lines.splice(range.endLine, 0, `- ${category} [+${value}]`);
  return lines.join("\n");
}

export function parseDiaryDay(content: string, heading: string, habits: string[]): DiaryDaySnapshot {
  const lines = content.split("\n");
  const range = sectionRange(lines, heading);
  const result: DiaryDaySnapshot = { habits: Object.fromEntries(habits.map(name => [name, false])), categories: {} };
  if (!range) return result;
  const absolute: Record<string, number> = {};
  const additions: Record<string, number> = {};
  for (let index = range.headingLine + 1; index < range.endLine; index += 1) {
    const line = lines[index].trim();
    const task = line.match(/^- \[([ xX])\] (.+)$/);
    if (task && habits.includes(task[2].trim())) result.habits[task[2].trim()] = task[1].toLowerCase() === "x";
    const duration = line.match(/^- ([a-z][\w-]*) \[(\+?)(\d+(?:\.\d{1,2})?)\]/i);
    if (!duration) continue;
    const category = duration[1].toLowerCase();
    const value = Number(duration[3]);
    if (duration[2] === "+") additions[category] = (additions[category] || 0) + value;
    else absolute[category] = value;
  }
  for (const category of new Set([...Object.keys(absolute), ...Object.keys(additions)])) {
    result.categories[category] = (absolute[category] || 0) + (additions[category] || 0);
  }
  return result;
}

function ensureNamedSection(content: string, title: string): { lines: string[]; range: SectionRange } {
  return ensureSection(content, title);
}

export function appendProjectLog(
  content: string,
  mmdd: string,
  time: string,
  hours: number,
  note: string
): string {
  const { lines, range } = ensureNamedSection(content, "log");
  let dateLine = -1;
  for (let index = range.headingLine + 1; index < range.endLine; index += 1) {
    if (lines[index].trim() === `- ${mmdd}` && !/^\s/.test(lines[index])) { dateLine = index; break; }
  }
  if (dateLine < 0) {
    dateLine = range.endLine;
    lines.splice(dateLine, 0, `- ${mmdd}`);
  }
  let insertAt = dateLine + 1;
  while (insertAt < lines.length && (/^\s+/.test(lines[insertAt]) || lines[insertAt].trim() === "")) insertAt += 1;
  const value = Number(hours.toFixed(2));
  const suffix = note.trim() ? ` ${note.trim()}` : "";
  lines.splice(insertAt, 0, `\t- [${time}] [+${value}]${suffix}`);
  return lines.join("\n");
}

export function appendProjectTask(content: string, title: string, id: string): string {
  const { lines, range } = ensureNamedSection(content, "任务");
  lines.splice(range.endLine, 0, `- [ ] ${title.trim()} ^${id}`);
  return lines.join("\n");
}

export function setProjectTaskDone(content: string, id: string, done: boolean): string {
  const lines = content.split("\n");
  const marker = `^${id}`;
  const index = lines.findIndex(line => line.includes(marker) && /- \[[ xX]\]/.test(line));
  if (index < 0) return content;
  lines[index] = lines[index].replace(/- \[[ xX]\]/, `- [${done ? "x" : " "}]`);
  return lines.join("\n");
}

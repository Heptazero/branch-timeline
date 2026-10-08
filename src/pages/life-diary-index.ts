import { App, TFile, normalizePath } from "obsidian";
import type { LifeDiaryEntry, LifeDiaryWeek } from "./life-diary";
import { diaryWeek, parseLifeDiary } from "./life-diary";

export async function loadLifeDiary(app: App, folder: string, formats: readonly string[]): Promise<{ entries: LifeDiaryEntry[]; weeks: LifeDiaryWeek[] }> {
  const prefix = `${normalizePath(folder).replace(/\/$/, "")}/`;
  const weeks = app.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix))
    .map(file => ({ file, week: diaryWeek(file.path) }))
    .filter((item): item is { file: TFile; week: LifeDiaryWeek } => item.week !== null)
    .sort((a, b) => a.week.date.localeCompare(b.week.date));
  const entries = await Promise.all(weeks.map(async ({ file, week }) => {
    try { return parseLifeDiary(await app.vault.read(file), week, formats); }
    catch { return []; }
  }));
  return { entries: entries.flat(), weeks: weeks.map(item => item.week) };
}

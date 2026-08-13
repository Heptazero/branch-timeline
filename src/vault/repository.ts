import { App, TFile, normalizePath } from "obsidian";
import type { BranchTimelineSettings, DiaryDaySnapshot, ProjectRef } from "../types";
import {
  appendCategoryDuration,
  appendProjectLog,
  appendProjectTask,
  createWeekSkeleton,
  diaryFilePath,
  diaryHeading,
  parseDiaryDay,
  setHabitInDiary,
  setProjectTaskDone
} from "./format";

export class VaultRepository {
  constructor(private app: App, private settings: BranchTimelineSettings) {}

  updateSettings(settings: BranchTimelineSettings): void { this.settings = settings; }

  listProjects(): ProjectRef[] {
    const prefix = `${normalizePath(this.settings.projectFolder).replace(/\/$/, "")}/`;
    return this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix)).flatMap(file => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.type !== "project") return [];
      return [{ path: file.path, name: file.basename, status: String(frontmatter.status || "") }];
    }).sort((a, b) => {
      const rank = (status: string) => status === "active" ? 0 : status === "todo" ? 1 : 2;
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "zh-CN");
    });
  }

  async readDiaryDay(date: Date): Promise<DiaryDaySnapshot> {
    const file = this.app.vault.getAbstractFileByPath(diaryFilePath(date, this.settings.diaryFolder));
    if (!(file instanceof TFile)) return parseDiaryDay("", diaryHeading(date), this.settings.habits);
    return parseDiaryDay(await this.app.vault.read(file), diaryHeading(date), this.settings.habits);
  }

  async setHabit(date: Date, habit: string, done: boolean): Promise<void> {
    const file = await this.ensureDiaryFile(date);
    await this.app.vault.process(file, content => setHabitInDiary(content, diaryHeading(date), habit, done));
  }

  async addCategoryDuration(date: Date, category: string, minutes: number): Promise<void> {
    const file = await this.ensureDiaryFile(date);
    await this.app.vault.process(file, content =>
      appendCategoryDuration(content, diaryHeading(date), category, minutes / 60)
    );
  }

  async addProjectLog(projectPath: string, date: Date, endMinute: number, minutes: number, note: string): Promise<void> {
    const file = this.projectFile(projectPath);
    const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const time = `${String(Math.floor(endMinute / 60) % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
    await this.app.vault.process(file, content => appendProjectLog(content, mmdd, time, minutes / 60, note));
  }

  async addProjectTask(projectPath: string, title: string, id: string): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.app.vault.process(file, content => appendProjectTask(content, title, id));
  }

  async setProjectTaskDone(projectPath: string, id: string, done: boolean): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.app.vault.process(file, content => setProjectTaskDone(content, id, done));
  }

  private projectFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error(`找不到项目文件：${path}`);
    return file;
  }

  private async ensureDiaryFile(date: Date): Promise<TFile> {
    const path = normalizePath(diaryFilePath(date, this.settings.diaryFolder));
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    const folder = path.split("/").slice(0, -1).join("/");
    if (folder && !(await this.app.vault.adapter.exists(folder))) await this.app.vault.createFolder(folder);
    return this.app.vault.create(path, createWeekSkeleton(date, this.settings.habits));
  }
}

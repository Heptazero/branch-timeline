import { App, TFile, normalizePath } from "obsidian";
import type { BranchTimelineSettings, DiaryDaySnapshot, ProjectRef } from "../types";
import type { UndoAction } from "../undo-manager";
import {
  appendCategoryDuration,
  appendProjectLog,
  appendProjectTask,
  createWeekSkeleton,
  dateKey,
  diaryFilePath,
  diaryHeading,
  parseDiaryDay,
  setHabitInDiary,
  setProjectTaskDone,
  upsertProjectNote
} from "./format";

export class VaultRepository {
  private recordUndo: ((action: UndoAction) => void) | null = null;
  constructor(private app: App, private settings: BranchTimelineSettings) {}

  updateSettings(settings: BranchTimelineSettings): void { this.settings = settings; }
  setUndoRecorder(record: (action: UndoAction) => void): void { this.recordUndo = record; }

  listProjects(): ProjectRef[] {
    const prefix = `${normalizePath(this.settings.projectFolder).replace(/\/$/, "")}/`;
    return this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix)).flatMap(file => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.type !== "project") return [];
      return [{
        path: file.path,
        name: file.basename,
        status: String(frontmatter.status || ""),
        color: typeof frontmatter.color === "string" ? frontmatter.color : undefined
      }];
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
    await this.process(file, content => setHabitInDiary(content, diaryHeading(date), habit, done));
  }

  async addCategoryDuration(date: Date, category: string, minutes: number): Promise<void> {
    const file = await this.ensureDiaryFile(date);
    await this.process(file, content =>
      appendCategoryDuration(content, diaryHeading(date), category, minutes / 60)
    );
  }

  async addProjectLog(projectPath: string, date: Date, endMinute: number, minutes: number, note: string): Promise<void> {
    const file = this.projectFile(projectPath);
    const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const time = `${String(Math.floor(endMinute / 60) % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
    await this.process(file, content => appendProjectLog(content, mmdd, time, minutes / 60, note));
  }

  async syncProjectNote(
    projectPath: string,
    date: Date | string,
    minute: number,
    previousNote: string,
    nextNote: string
  ): Promise<void> {
    const file = this.projectFile(projectPath);
    const mmdd = typeof date === "string"
      ? `${date.slice(5, 7)}${date.slice(8, 10)}`
      : `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const normalized = ((minute % 1440) + 1440) % 1440;
    const time = `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
    await this.process(file, content => upsertProjectNote(content, mmdd, time, previousNote, nextNote));
  }

  async addProjectTask(projectPath: string, title: string, id: string): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.process(file, content => appendProjectTask(content, title, id));
  }

  async setProjectTaskDone(projectPath: string, id: string, done: boolean): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.process(file, content => setProjectTaskDone(content, id, done));
  }

  async createProject(name: string, status: string, date: Date): Promise<ProjectRef> {
    const folder = normalizePath(this.settings.projectFolder).replace(/\/$/, "");
    if (!(await this.app.vault.adapter.exists(folder))) await this.app.vault.createFolder(folder);
    const safeName = name.trim().replace(/[\\/:*?"<>|#\[\]]/g, "-");
    const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const basename = /^\d{4}_/.test(safeName) ? safeName : `${mmdd}_${safeName}`;
    const path = normalizePath(`${folder}/${basename}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error("已有同名项目");
    const created = await this.app.vault.create(path, [
      "---",
      "type: project",
      `status: ${status}`,
      `started: ${dateKey(date)}`,
      "---",
      "",
      "## 任务",
      "",
      "## log",
      ""
    ].join("\n"));
    this.recordUndo?.(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.trash(file, true);
    });
    return { path: created.path, name: basename, status };
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
    const created = await this.app.vault.create(path, createWeekSkeleton(date, this.settings.habits));
    this.recordUndo?.(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.trash(file, true);
    });
    return created;
  }

  private async process(file: TFile, transform: (content: string) => string): Promise<void> {
    const before = await this.app.vault.read(file);
    await this.app.vault.process(file, transform);
    this.recordUndo?.(async () => {
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (current instanceof TFile) await this.app.vault.modify(current, before);
    });
  }
}

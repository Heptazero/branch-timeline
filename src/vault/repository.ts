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
  projectDayTotal,
  setHabitInDiary,
  setProjectTaskDone,
  upsertProjectDayTotal,
  updateProjectWorkLogNote,
  upsertProjectNote
} from "./format";
import { indexProjectTasks, linkProjectTask, upsertProjectTaskTotals } from "./project-tasks";
import type { ProjectTaskIndex, ProjectWorkTask } from "./project-tasks";

export class VaultRepository {
  private recordUndo: ((action: UndoAction) => void) | null = null;
  constructor(private app: App, private settings: BranchTimelineSettings) {}

  updateSettings(settings: BranchTimelineSettings): void { this.settings = settings; }
  setUndoRecorder(record: (action: UndoAction) => void): void { this.recordUndo = record; }

  listProjects(): ProjectRef[] {
    const configuredTypes = this.settings.projectTypes.filter(item => item.type.trim());
    const types = new Map(configuredTypes.map(item => [item.type.trim().toLowerCase(), item]));
    const typeRank = new Map(configuredTypes.map((item, index) => [item.type.trim().toLowerCase(), index]));
    return this.app.vault.getMarkdownFiles().flatMap(file => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const type = typeof frontmatter?.type === "string" ? frontmatter.type.trim() : "";
      const config = types.get(type.toLowerCase());
      if (!config) return [];
      return [{
        path: file.path,
        name: file.basename,
        type,
        status: String(frontmatter?.status || ""),
        color: typeof frontmatter?.color === "string" ? frontmatter.color : config.color
      }];
    }).sort((a, b) => {
      const rank = (status: string) => status === "active" ? 0 : status === "todo" ? 1 : 2;
      return rank(a.status) - rank(b.status)
        || (typeRank.get(a.type.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) - (typeRank.get(b.type.toLowerCase()) ?? Number.MAX_SAFE_INTEGER)
        || a.name.localeCompare(b.name, "zh-CN");
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

  async addProjectLog(projectPath: string, date: Date, endMinute: number, minutes: number, note: string, workId?: string): Promise<void> {
    const file = this.projectFile(projectPath);
    const time = `${String(Math.floor(endMinute / 60) % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
    await this.process(file, content => appendProjectLog(content, dateKey(date), time, minutes / 60, note, workId));
  }

  async updateProjectWorkLogNote(projectPath: string, workId: string, taskTitle: string | undefined, note: string): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.process(file, content => updateProjectWorkLogNote(content, workId, taskTitle, note));
  }

  async readProjectDayTotal(projectPath: string, date: string): Promise<ReturnType<typeof projectDayTotal>> {
    return projectDayTotal(await this.app.vault.read(this.projectFile(projectPath)), date);
  }

  async syncProjectDayTotal(projectPath: string, date: string, minutes: number): Promise<void> {
    const file = this.projectFile(projectPath);
    const before = await this.app.vault.read(file);
    try {
      if (upsertProjectDayTotal(before, date, minutes) === before) return;
      await this.app.vault.process(file, content => upsertProjectDayTotal(content, date, minutes));
    } catch (error) {
      throw new Error(`${file.basename}：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async syncProjectNote(
    projectPath: string,
    date: Date | string,
    minute: number,
    previousNote: string,
    nextNote: string
  ): Promise<void> {
    const file = this.projectFile(projectPath);
    const key = typeof date === "string" ? date : dateKey(date);
    const normalized = ((minute % 1440) + 1440) % 1440;
    const time = `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
    await this.process(file, content => upsertProjectNote(content, key, time, previousNote, nextNote));
  }

  async addProjectTask(projectPath: string, title: string, id: string): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.process(file, content => appendProjectTask(content, title, id));
  }

  async projectTasks(projectPath: string): Promise<ProjectTaskIndex> {
    return indexProjectTasks(await this.app.vault.read(this.projectFile(projectPath)), this.settings.projectTaskHeadings);
  }

  async prepareTimelineTodo(projectPath: string, date: Date, minute: number, note: string, task: ProjectWorkTask | null, taskId?: string): Promise<void> {
    if (!note && !task) return;
    const file = this.projectFile(projectPath);
    const time = `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    await this.process(file, content => {
      if (task && !taskId) throw new Error("关联任务缺少 ID");
      const withTask = task ? linkProjectTask(content, this.settings.projectTaskHeadings, task, taskId!) : content;
      return note ? upsertProjectNote(withTask, dateKey(date), time, "", note) : withTask;
    });
  }

  async recordProjectWork(
    projectPath: string, date: Date, endMinute: number, minutes: number, note: string,
    workId: string, task: ProjectWorkTask | null, taskId: string | undefined, completeTask = false
  ): Promise<void> {
    const file = this.projectFile(projectPath);
    const time = `${String(Math.floor(endMinute / 60) % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
    await this.process(file, content => {
      let next = content;
      if (task && !taskId) throw new Error("关联任务缺少 ID");
      if (task) next = linkProjectTask(next, this.settings.projectTaskHeadings, task, taskId!);
      if (completeTask && taskId) next = setProjectTaskDone(next, taskId, true);
      return minutes > 0 ? appendProjectLog(next, dateKey(date), time, minutes / 60, note, workId) : next;
    });
  }

  async syncProjectTaskTotals(projectPath: string, totals: ReadonlyMap<string, number>): Promise<void> {
    const file = this.projectFile(projectPath);
    const before = await this.app.vault.read(file);
    if (upsertProjectTaskTotals(before, totals) === before) return;
    await this.app.vault.process(file, content => upsertProjectTaskTotals(content, totals));
  }

  async setProjectTaskDone(projectPath: string, id: string, done: boolean): Promise<void> {
    const file = this.projectFile(projectPath);
    await this.process(file, content => setProjectTaskDone(content, id, done));
  }

  async completeProjectTaskWithLog(projectPath: string, id: string, date: Date, endMinute: number, minutes: number, note: string, workId: string): Promise<void> {
    const file = this.projectFile(projectPath);
    const time = `${String(Math.floor(endMinute / 60) % 24).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
    await this.process(file, content => {
      if (!content.split("\n").some(line => line.trimEnd().endsWith(`^${id}`) && /^\s*[-*+]\s+\[[ xX]\]/.test(line))) {
        throw new Error("找不到关联任务，请重新选择");
      }
      const completed = setProjectTaskDone(content, id, true);
      return minutes > 0 ? appendProjectLog(completed, dateKey(date), time, minutes / 60, note, workId) : completed;
    });
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
    const projectType = this.settings.projectTypes.find(item => item.type.trim().toLowerCase() === "project");
    return { path: created.path, name: basename, type: "project", status, color: projectType?.color };
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

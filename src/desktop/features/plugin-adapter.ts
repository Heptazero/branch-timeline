import type { App } from "obsidian";
import { Notice } from "obsidian";
import type BranchTimelinePlugin from "../../main";
import type { BranchTimelineSettings } from "../../types";
import { StateStore, defaultDay } from "../../vault/state-store";
import { VaultRepository } from "../../vault/repository";
import { UndoManager } from "../../undo-manager";
import { ProjectTimeSync, changedProjectDates, projectPathsOn } from "../../vault/project-time-sync";
import { normalizeSettings } from "../../settings-state";
import { ProjectSuggestModal, TextEntryModal } from "../../modals";
import { ProjectWorkModal, type ProjectWorkResult } from "../../project-work-modal";
import { dateKey, logicalToday } from "../../vault/format";
import { CONFIG } from "./app-adapter";
import { rpc } from "./rpc";

export class FeaturePlugin {
  manifest = { id: "branch-timeline-hz" };
  settings: BranchTimelineSettings;
  store: StateStore; repository: VaultRepository; undoManager = new UndoManager(); projectTimeSync: ProjectTimeSync;
  refresh: () => Promise<void> = async () => {};
  private savedSettings: string;
  private saving: Promise<void> = Promise.resolve();
  constructor(public app: App, settings: Record<string, unknown>) {
    this.settings = normalizeSettings(settings); this.savedSettings = JSON.stringify(this.settings);
    this.store = new StateStore(app, this.settings.statePath); this.repository = new VaultRepository(app, this.settings);
    this.store.setUndoRecorder(action => this.undoManager.record(action)); this.repository.setUndoRecorder(action => this.undoManager.record(action));
    this.projectTimeSync = new ProjectTimeSync(this.repository, this.store, () => {});
    const schedule = this.projectTimeSync.schedule.bind(this.projectTimeSync);
    // Opening an unrelated page must not rewrite project notes. Explicit sync and user edits still sync.
    this.projectTimeSync.schedule = (date, paths = [], callback) => { const values = [...paths]; if (values.length || callback) schedule(date, values, callback); };
    this.store.setChangeListener((before, after) => { for (const date of changedProjectDates(before, after)) this.projectTimeSync.schedule(date, projectPathsOn(before, after, date)); });
  }
  asPlugin(): BranchTimelinePlugin { return this as unknown as BranchTimelinePlugin; }
  saveSettings(refresh = true): Promise<void> {
    const draft = JSON.stringify(this.settings), base = JSON.parse(this.savedSettings) as Record<string, unknown>;
    const patch = Object.fromEntries(Object.entries(JSON.parse(draft) as Record<string, unknown>).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])));
    const save = async () => {
      const before = await this.app.vault.adapter.read(CONFIG), latest = normalizeSettings(JSON.parse(before));
      const settings = { ...latest, ...patch } as BranchTimelineSettings, written = JSON.stringify(settings, null, 2);
      await rpc("write", { path: CONFIG, text: written, expected: before });
      this.savedSettings = JSON.stringify(settings);
      if (JSON.stringify(this.settings) === draft) this.settings = settings;
      this.undoManager.record(async () => {
        await rpc("write", { path: CONFIG, text: before, expected: written });
        this.settings = normalizeSettings(JSON.parse(before)); this.savedSettings = JSON.stringify(this.settings);
        this.repository.updateSettings(this.settings); this.store.setPath(this.settings.statePath);
      });
      this.repository.updateSettings(this.settings); this.store.setPath(this.settings.statePath);
      if (refresh) await this.refreshViews();
      await rpc("status", { canUndo: this.undoManager.canUndo });
    };
    const next = this.saving.then(save); this.saving = next.catch(() => {}); return next;
  }
  async refreshViews(): Promise<void> { await this.refresh(); await rpc("changed"); }
  async refreshTimerStatus(): Promise<void> {} // Existing page clock updates the legacy per-item timers.
  async undoLast(): Promise<void> { await this.undoManager.undo(); await this.refreshViews(); }
  checkProjectSync(date: string): void { this.projectTimeSync.schedule(date, [], status => { new Notice(status === "synced" ? "已写入项目笔记" : status === "error" ? this.projectTimeSync.error(date) || "同步失败" : "无需同步"); void this.refresh(); }); }
  private async chooseProject() {
    const values = this.repository.listProjects().filter(project => ["active", "doing", "进行中"].includes(project.status));
    return new Promise<(typeof values)[number] | null>(resolve => new ProjectSuggestModal(this.app, values, resolve).open());
  }
  async addProjectTask(date: Date): Promise<void> {
    const project = await this.chooseProject(); if (!project) return;
    const title = await new Promise<string | null>(resolve => new TextEntryModal(this.app, "添加项目待办", "待办标题", resolve).open()); if (!title) return;
    const id = "btl-" + crypto.randomUUID();
    await this.repository.addProjectTask(project.path, title, id, () => this.store.update(state => { const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm); day.items.push({ id, title, kind: "todo", plannedMin: this.minute(date), projectPath: project.path, projectTaskId: id }); }).then(() => {}));
    await this.refreshViews();
  }
  async recordProjectWork(date: Date): Promise<void> {
    const project = await this.chooseProject(); if (!project) return;
    const index = await this.repository.projectTasks(project.path);
    const result = await new Promise<ProjectWorkResult | null>(resolve => new ProjectWorkModal(this.app, project.name, index, this.settings.linkProjectWorkTasks, this.settings.lastProjectTasks[project.path], this.settings.lastProjectTaskHeadings[project.path], resolve).open());
    if (!result) return;
    const end = this.minute(date), id = "fact-" + crypto.randomUUID();
    const task = result.task, taskId = task ? (task.kind === "existing" ? task.entry.id : undefined) || "btl-" + crypto.randomUUID() : undefined;
    const taskTitle = task?.kind === "existing" ? task.entry.title : task?.title;
    const headingKey = task?.kind === "existing" ? task.entry.headingKey : task?.headingKey;
    const title = taskTitle || result.note || project.name;
    await this.repository.recordProjectWork(project.path, date, end, result.minutes, [taskTitle ? "@" + taskTitle : "", result.note].filter(Boolean).join(" "), id, task, taskId, false, () => this.store.update(state => {
      const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm);
      day.items.push({ id, title, kind: "fact", startMin: end - result.minutes, endMin: end, projectPath: project.path, projectTaskId: taskId, projectTaskTitle: taskTitle, projectLogId: id, note: result.note || undefined });
    }).then(() => {}));
    this.settings.linkProjectWorkTasks = result.linkTask;
    if (taskId) this.settings.lastProjectTasks[project.path] = taskId;
    if (headingKey) this.settings.lastProjectTaskHeadings[project.path] = headingKey;
    await this.saveSettings(false); await this.refreshViews();
  }
  private minute(date: Date): number { const now = new Date(); return dateKey(date) === dateKey(logicalToday()) ? now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0) : this.settings.rhythm.napEnd; }
}

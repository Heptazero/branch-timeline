import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ChoiceSuggestModal, DurationModal, ProjectSuggestModal, TextEntryModal } from "./modals";
import { normalizeRhythmSchedule } from "./rhythm";
import { BranchTimelineSettingTab, DEFAULT_SETTINGS } from "./settings";
import { loadTags, tagCategoryKey } from "./tags";
import { BRANCH_TIMELINE_VIEW, BranchTimelineView } from "./timeline-view";
import type { BranchTimelineSettings, ProjectRef } from "./types";
import { dateKey, logicalToday } from "./vault/format";
import { VaultRepository } from "./vault/repository";
import { StateStore, defaultDay } from "./vault/state-store";

export default class BranchTimelinePlugin extends Plugin {
  settings: BranchTimelineSettings = DEFAULT_SETTINGS;
  store!: StateStore;
  repository!: VaultRepository;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new StateStore(this.app, this.settings.statePath);
    this.repository = new VaultRepository(this.app, this.settings);
    await this.store.ensure();
    this.registerView(BRANCH_TIMELINE_VIEW, leaf => new BranchTimelineView(leaf, this));
    this.addSettingTab(new BranchTimelineSettingTab(this.app, this));
    this.addRibbonIcon("git-branch", "打开分支时间线", () => void this.openTimeline());
    this.addCommand({ id: "open-timeline", name: "打开时间线", callback: () => void this.openTimeline() });
    this.addCommand({ id: "toggle-habit", name: "打卡习惯", callback: () => void this.toggleHabit(logicalToday()) });
    this.addCommand({ id: "record-project-work", name: "记录项目工时", callback: () => void this.recordProjectWork(logicalToday()) });
    this.addCommand({ id: "record-category-duration", name: "记录分类时长", callback: () => void this.recordCategoryDuration(logicalToday()) });
    this.addCommand({ id: "add-project-task", name: "添加项目待办", callback: () => void this.addProjectTask(logicalToday()) });
  }

  onunload(): void { this.app.workspace.detachLeavesOfType(BRANCH_TIMELINE_VIEW); }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData() as (Partial<BranchTimelineSettings> & {
      tagMap?: Record<string, string>;
      dayStartMinute?: number;
      dayEndMinute?: number;
    }) | null;
    const { tagMap, dayStartMinute, dayEndMinute, ...settings } = saved || {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      habits: Array.isArray(saved?.habits) ? saved.habits : DEFAULT_SETTINGS.habits,
      tags: loadTags(saved?.tags, tagMap),
      rhythm: normalizeRhythmSchedule(saved?.rhythm, dayStartMinute, dayEndMinute)
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.store?.setPath(this.settings.statePath);
    this.repository?.updateSettings(this.settings);
    await this.refreshViews();
  }

  async openTimeline(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: BRANCH_TIMELINE_VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async toggleHabit(date: Date): Promise<void> {
    const choice = await this.choose("选择习惯", this.settings.habits.map(name => ({ id: name, label: name })));
    if (!choice) return;
    const snapshot = await this.repository.readDiaryDay(date);
    const next = !snapshot.habits[choice.id];
    await this.repository.setHabit(date, choice.id, next);
    new Notice(`${choice.label} · ${next ? "完成" : "取消"}`);
    await this.refreshViews();
  }

  async recordProjectWork(date: Date): Promise<void> {
    const project = await this.chooseProject();
    if (!project) return;
    const result = await this.duration(`记录 · ${project.name}`);
    if (!result) return;
    const end = this.minuteNow(date);
    const start = Math.max(this.settings.rhythm.wake, end - result.minutes);
    await this.repository.addProjectLog(project.path, date, end, result.minutes, result.note);
    await this.store.update(state => {
      const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm);
      day.items.push({
        id: this.uid("fact"), title: result.note || project.name, kind: "fact", startMin: start, endMin: end,
        projectPath: project.path, note: result.note || undefined
      });
    });
    new Notice(`${project.name} · ${result.minutes} 分钟`);
    await this.refreshViews();
  }

  async recordCategoryDuration(date: Date): Promise<void> {
    const tags = this.settings.tags.filter(tag => tag.name.trim());
    if (!tags.length) { new Notice("请先添加标签。"); return; }
    const choice = await this.choose("选择标签", tags.map(tag => ({ id: tag.id, label: tag.name })));
    if (!choice) return;
    const tag = tags.find(item => item.id === choice.id);
    if (!tag) return;
    const result = await this.duration(`记录 · ${choice.label}`);
    if (!result) return;
    const end = this.minuteNow(date);
    const start = Math.max(this.settings.rhythm.wake, end - result.minutes);
    await this.repository.addCategoryDuration(date, tagCategoryKey(tag), result.minutes);
    await this.store.update(state => {
      const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm);
      day.items.push({
        id: this.uid("fact"), title: result.note || choice.label, kind: "fact", startMin: start, endMin: end,
        tagId: tag.id, tag: tag.name, note: result.note || undefined
      });
    });
    new Notice(`${choice.label} · ${result.minutes} 分钟`);
    await this.refreshViews();
  }

  async addProjectTask(date: Date): Promise<void> {
    const project = await this.chooseProject();
    if (!project) return;
    const title = await this.text("添加项目待办", "待办标题");
    if (!title) return;
    const id = this.uid("btl");
    await this.repository.addProjectTask(project.path, title, id);
    await this.store.update(state => {
      const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm);
      day.items.push({ id, title, kind: "todo", plannedMin: this.minuteNow(date), projectPath: project.path, projectTaskId: id });
    });
    new Notice(`已添加到 ${project.name}`);
    await this.refreshViews();
  }

  async refreshViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)) {
      if (leaf.view instanceof BranchTimelineView) await leaf.view.refresh();
    }
  }

  private chooseProject(): Promise<ProjectRef | null> {
    const projects = this.repository.listProjects();
    if (!projects.length) { new Notice("没有找到 type: project 的项目笔记。"); return Promise.resolve(null); }
    return new Promise(resolve => {
      let settled = false;
      const finish = (value: ProjectRef | null) => { if (!settled) { settled = true; resolve(value); } };
      new ProjectSuggestModal(this.app, projects, finish).open();
    });
  }

  private choose(title: string, items: { id: string; label: string }[]): Promise<{ id: string; label: string } | null> {
    return new Promise(resolve => new ChoiceSuggestModal(this.app, title, items, resolve).open());
  }

  private duration(title: string): Promise<{ minutes: number; note: string } | null> {
    return new Promise(resolve => new DurationModal(this.app, title, resolve).open());
  }

  private text(title: string, placeholder: string): Promise<string | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (value: string | null) => { if (!settled) { settled = true; resolve(value); } };
      const modal = new TextEntryModal(this.app, title, placeholder, finish);
      const originalClose = modal.onClose.bind(modal);
      modal.onClose = () => { originalClose(); finish(null); };
      modal.open();
    });
  }

  private minuteNow(date: Date): number {
    const today = dateKey(date) === dateKey(logicalToday());
    if (!today) return Math.min(this.settings.rhythm.sleep, 18 * 60);
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    const axisMinute = now.getHours() < 2 ? minute + 1440 : minute;
    return Math.max(this.settings.rhythm.wake, Math.min(this.settings.rhythm.sleep, axisMinute));
  }

  private uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

}

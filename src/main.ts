import { Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import type { Extension } from "@codemirror/state";
import { ChoiceSuggestModal, ConfirmModal, ProjectSuggestModal, TextEntryModal } from "./modals";
import { ProjectWorkModal } from "./project-work-modal";
import type { ProjectWorkResult } from "./project-work-modal";
import { normalizeRhythmMarkers, normalizeRhythmSchedule } from "./rhythm";
import { BranchTimelineSettingTab, DEFAULT_SETTINGS } from "./settings";
import { normalizeMentalStateLabels } from "./focus-state-model";
import { normalizeFocusColors } from "./focus-rhythm-color";
import { loadTags } from "./tags";
import { BRANCH_TIMELINE_VIEW, BranchTimelineView } from "./timeline-view";
import type { BranchTimelineSettings, ProjectRef } from "./types";
import { dateKey, logicalToday } from "./vault/format";
import { VaultRepository } from "./vault/repository";
import { StateStore, defaultDay } from "./vault/state-store";
import { changedProjectDates, projectPathsOn, ProjectTimeSync } from "./vault/project-time-sync";
import { UndoManager } from "./undo-manager";
import { compactDuration, elapsedMinutes, runningItems } from "./timeline/timer-service";
import { normalizeTaskHeadings } from "./vault/project-tasks";
import type { ProjectTaskIndex } from "./vault/project-tasks";
import { DiaryBracketSuggest } from "./diary-bracket-suggest";
import { reminderOn } from "./fixed-reminders/model";
import { hiddenPluginCommentsExtension } from "./editor/plugin-comment-visibility";
import { DailyReminderCache } from "./reminder-cache";

export default class BranchTimelinePlugin extends Plugin {
  settings: BranchTimelineSettings = DEFAULT_SETTINGS;
  store!: StateStore;
  repository!: VaultRepository;
  projectTimeSync!: ProjectTimeSync;
  readonly undoManager = new UndoManager();
  private timerStatusItem: HTMLElement | null = null;
  private timerStatusItemId: string | null = null;
  private readonly reminderCache = new DailyReminderCache();
  private lifeDiaryRefreshTimer: number | null = null;
  private lastStateError: string | null = null;
  private readonly commentEditorExtensions: Extension[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new StateStore(this.app, this.settings.statePath);
    this.repository = new VaultRepository(this.app, this.settings);
    this.projectTimeSync = new ProjectTimeSync(this.repository, this.store, () => this.refreshSyncClouds());
    this.store.setUndoRecorder(action => this.undoManager.record(action));
    this.store.setChangeListener((before, after) => {
      try {
        for (const date of changedProjectDates(before, after)) this.projectTimeSync.schedule(date, projectPathsOn(before, after, date));
      } catch (error) {
        new Notice(error instanceof Error ? `时间线已保存，但项目汇总未同步：${error.message}` : "时间线已保存，但项目汇总未同步");
      }
    });
    this.repository.setUndoRecorder(action => this.undoManager.record(action));
    await this.store.ensure();
    new DiaryBracketSuggest(this.app, () => this.settings.diaryFolder).start(this);
    this.registerEvent(this.app.vault.on("modify", file => {
      const folder = this.settings.diaryFolder.replace(/\/$/, "");
      if (file.path.startsWith(`${folder}/`)) this.scheduleLifeDiaryRefresh();
    }));
    if (Platform.isDesktopApp) {
      this.timerStatusItem = this.addStatusBarItem();
      this.timerStatusItem.addClass("btl-global-timer");
      this.timerStatusItem.onclick = () => void this.openRunningTimer();
    }
    await this.refreshTimerStatus();
    this.registerInterval(window.setInterval(() => void this.refreshTimerStatus(), 60_000));
    this.registerView(BRANCH_TIMELINE_VIEW, leaf => new BranchTimelineView(leaf, this));
    if (this.settings.hidePluginCommentsInEditor) this.commentEditorExtensions.push(hiddenPluginCommentsExtension);
    this.registerEditorExtension(this.commentEditorExtensions);
    this.addSettingTab(new BranchTimelineSettingTab(this.app, this));
    this.addRibbonIcon("panel-right-open", "固定分支时间线到右侧", () => void this.openTimelineRight(true));
    this.addRibbonIcon("git-branch", "在中间打开分支时间线", () => void this.openTimelineCenter());
    this.addCommand({ id: "open-timeline", name: "固定时间线到右侧", callback: () => void this.openTimelineRight(true) });
    this.addCommand({ id: "open-timeline-center", name: "在中间打开时间线", callback: () => void this.openTimelineCenter() });
    this.addCommand({ id: "record-project-work", name: "记录项目工时", callback: () => void this.recordProjectWork(logicalToday()) });
    this.addCommand({ id: "add-project-task", name: "添加项目待办", callback: () => void this.addProjectTask(logicalToday()) });
    this.addCommand({ id: "convert-project-comment-style", name: "转换项目笔记的插件注释格式", callback: () => void this.convertProjectComments() });
    this.app.workspace.onLayoutReady(() => {
      if (Platform.isDesktopApp) void this.openTimelineRight(false);
    });
  }

  onunload(): void {
    if (this.lifeDiaryRefreshTimer != null) window.clearTimeout(this.lifeDiaryRefreshTimer);
    this.app.workspace.detachLeavesOfType(BRANCH_TIMELINE_VIEW);
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData() as (Partial<BranchTimelineSettings> & {
      tagMap?: Record<string, string>;
      dayStartMinute?: number;
      dayEndMinute?: number;
      requireItemMetadata?: boolean;
      showProjectLogHeatmap?: boolean;
    }) | null;
    const { tagMap, dayStartMinute, dayEndMinute, requireItemMetadata, showProjectLogHeatmap: _legacyProjectLog, ...settings } = saved || {};
    const rhythm = normalizeRhythmSchedule(saved?.rhythm, dayStartMinute, dayEndMinute);
    const rhythmLabels = { ...DEFAULT_SETTINGS.rhythmLabels, ...(saved?.rhythmLabels || {}) };
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      pluginCommentStyle: saved?.pluginCommentStyle === "obsidian" ? "obsidian" : "html",
      hidePluginCommentsInEditor: saved?.hidePluginCommentsInEditor === true,
      projectTypes: Array.isArray(saved?.projectTypes)
        ? saved.projectTypes
          .filter(item => item && typeof item.type === "string" && typeof item.color === "string")
          .map(item => ({ type: item.type.trim(), color: item.color }))
        : DEFAULT_SETTINGS.projectTypes.map(item => ({ ...item })),
      projectTaskHeadings: normalizeTaskHeadings(saved?.projectTaskHeadings),
      lifeDiaryFormats: Array.isArray(saved?.lifeDiaryFormats) ? saved.lifeDiaryFormats.filter(value => typeof value === "string") : DEFAULT_SETTINGS.lifeDiaryFormats,
      linkProjectWorkTasks: saved?.linkProjectWorkTasks === true,
      lastProjectTasks: saved?.lastProjectTasks && typeof saved.lastProjectTasks === "object" ? saved.lastProjectTasks : {},
      lastProjectTaskHeadings: saved?.lastProjectTaskHeadings && typeof saved.lastProjectTaskHeadings === "object" ? saved.lastProjectTaskHeadings : {},
      itemMetadataRequirement: this.metadataRequirement(saved),
      habits: Array.isArray(saved?.habits) ? saved.habits : DEFAULT_SETTINGS.habits,
      tags: Array.isArray(saved?.tags) || tagMap ? loadTags(saved?.tags, tagMap) : [],
      rhythm,
      rhythmMarkers: normalizeRhythmMarkers(saved?.rhythmMarkers, rhythm, rhythmLabels),
      rhythmLabels,
      mentalStateLabels: normalizeMentalStateLabels(saved?.mentalStateLabels),
      focusColors: normalizeFocusColors(saved?.focusColors),
      visiblePages: Array.isArray(saved?.visiblePages)
        ? ["day", ...saved.visiblePages.filter(page => page !== "day"), ...(saved.pageVisibilityVersion === 2 ? [] : ["life" as const])]
        : DEFAULT_SETTINGS.visiblePages,
      pageVisibilityVersion: 2,
      projectOrder: Array.isArray(saved?.projectOrder) ? saved.projectOrder : [],
      pinnedProjects: Array.isArray(saved?.pinnedProjects) ? saved.pinnedProjects : [],
      collapsedProjectGroups: Array.isArray(saved?.collapsedProjectGroups) ? saved.collapsedProjectGroups : [],
      policySceneWidths: saved?.policySceneWidths && typeof saved.policySceneWidths === "object" ? saved.policySceneWidths : {},
      habitCardOrder: Array.isArray(saved?.habitCardOrder) ? saved.habitCardOrder : DEFAULT_SETTINGS.habitCardOrder,
      timerReminderMinutes: typeof saved?.timerReminderMinutes === "number" && Number.isFinite(saved.timerReminderMinutes)
        ? Math.max(0, Math.round(saved.timerReminderMinutes))
        : DEFAULT_SETTINGS.timerReminderMinutes
    };
  }

  private metadataRequirement(saved: (Partial<BranchTimelineSettings> & { requireItemMetadata?: boolean }) | null): BranchTimelineSettings["itemMetadataRequirement"] {
    const requirement = saved?.itemMetadataRequirement;
    if (requirement === "project" || requirement === "both") return "project";
    return "none";
  }

  async saveSettings(refresh = true): Promise<void> {
    const before = await this.loadData();
    await this.saveData(this.settings);
    this.undoManager.record(async () => {
      await this.saveData(before);
      await this.loadSettings();
      this.store.setPath(this.settings.statePath);
      this.repository.updateSettings(this.settings);
      this.syncCommentEditorExtensions();
    });
    this.store?.setPath(this.settings.statePath);
    this.repository?.updateSettings(this.settings);
    this.syncCommentEditorExtensions();
    if (refresh) await this.refreshViews();
  }

  private syncCommentEditorExtensions(): void {
    const hidden = this.settings.hidePluginCommentsInEditor;
    if (hidden === !!this.commentEditorExtensions.length) return;
    this.commentEditorExtensions.splice(0, this.commentEditorExtensions.length, ...(hidden ? [hiddenPluginCommentsExtension] : []));
    this.app.workspace.updateOptions();
  }

  private async convertProjectComments(): Promise<void> {
    try {
      const plan = await this.repository.previewPluginCommentConversion(this.settings.pluginCommentStyle);
      if (!plan.markerCount) { new Notice("项目笔记中的插件注释已是当前格式"); return; }
      const label = this.settings.pluginCommentStyle === "obsidian" ? "Obsidian %%" : "HTML";
      new ConfirmModal(this.app, "转换项目笔记注释", `将 ${plan.changes.length} 个项目文件中的 ${plan.markerCount} 个插件标记转换为 ${label}；不改正文。若文件在确认后变化，转换会停止。`, async () => {
        try {
          await this.repository.applyPluginCommentConversion(plan);
          new Notice(`已转换 ${plan.markerCount} 个插件标记`);
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "注释转换失败");
        }
      }, "转换", false).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "无法检查项目笔记注释");
    }
  }

  async undoLast(): Promise<void> {
    try {
      const before = await this.store.load();
      if (!(await this.undoManager.undo())) return;
      const after = await this.store.load();
      for (const date of changedProjectDates(before, after)) this.projectTimeSync.schedule(date, projectPathsOn(before, after, date));
      this.store.setPath(this.settings.statePath);
      this.repository.updateSettings(this.settings);
      await this.refreshViews();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "撤回失败，已停止以保护其他修改");
    }
  }

  async openTimelineRight(focus = true): Promise<void> {
    if (Platform.isDesktopApp) {
      const leaf = await this.app.workspace.ensureSideLeaf(BRANCH_TIMELINE_VIEW, "right", {
        active: focus,
        split: false,
        reveal: true
      });
      leaf.setPinned(true);
      if (focus) this.app.workspace.revealLeaf(leaf);
      return;
    }
    let leaf = this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: BRANCH_TIMELINE_VIEW, active: true });
    }
    if (focus) this.app.workspace.revealLeaf(leaf);
  }

  async openTimelineCenter(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: BRANCH_TIMELINE_VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async recordProjectWork(date: Date): Promise<void> {
    const project = await this.chooseProject();
    if (!project) return;
    let index: ProjectTaskIndex;
    try { index = await this.repository.projectTasks(project.path); }
    catch (error) { new Notice(error instanceof Error ? error.message : "项目任务读取失败"); return; }
    const result = await new Promise<ProjectWorkResult | null>(resolve => new ProjectWorkModal(
      this.app, project.name, index, this.settings.linkProjectWorkTasks,
      this.settings.lastProjectTasks[project.path], this.settings.lastProjectTaskHeadings[project.path], resolve
    ).open());
    if (!result) return;
    const end = this.minuteNow(date);
    const start = end - result.minutes;
    const factId = this.uid("fact");
    let taskId: string | undefined;
    let taskTitle: string | undefined;
    let headingKey: string | undefined;
    if (result.task?.kind === "existing") {
      taskId = result.task.entry.id || this.uid("btl");
      taskTitle = result.task.entry.title;
      headingKey = result.task.entry.headingKey;
    } else if (result.task?.kind === "new") {
      taskId = this.uid("btl");
      taskTitle = result.task.title;
      headingKey = result.task.headingKey;
    }
    const logNote = [taskTitle ? `@${taskTitle}` : "", result.note].filter(Boolean).join(" ");
    try {
      await this.repository.recordProjectWork(project.path, date, end, result.minutes, logNote, factId, result.task, taskId, false, async () => {
        await this.store.update(state => {
          const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm);
          day.items.push({
            id: factId, title: taskTitle || result.note || project.name, kind: "fact", startMin: start, endMin: end,
            projectPath: project.path, projectTaskId: taskId, projectTaskTitle: taskTitle, projectLogId: factId, note: result.note || undefined
          });
        });
      });
    } catch (error) { new Notice(error instanceof Error ? error.message : "项目工时写入失败"); return; }
    this.settings.linkProjectWorkTasks = result.linkTask;
    if (taskId) this.settings.lastProjectTasks[project.path] = taskId;
    if (headingKey) this.settings.lastProjectTaskHeadings[project.path] = headingKey;
    await this.saveSettings(false);
    new Notice(`${project.name} · ${result.minutes} 分钟`);
    await this.refreshViews();
  }

  async addProjectTask(date: Date): Promise<void> {
    const project = await this.chooseProject();
    if (!project) return;
    const title = await this.text("添加项目待办", "待办标题");
    if (!title) return;
    const id = this.uid("btl");
    try {
      await this.repository.addProjectTask(project.path, title, id, async () => {
        await this.store.update(state => {
          const day = state.days[dateKey(date)] ||= defaultDay(this.settings.rhythm);
          day.items.push({ id, title, kind: "todo", plannedMin: this.minuteNow(date), projectPath: project.path, projectTaskId: id });
        });
      });
    } catch (error) { new Notice(error instanceof Error ? error.message : "项目待办写入失败"); return; }
    new Notice(`已添加到 ${project.name}`);
    await this.refreshViews();
  }

  async refreshViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)) {
      if (leaf.view instanceof BranchTimelineView) await leaf.view.refresh();
    }
    await this.refreshTimerStatus();
  }

  private scheduleLifeDiaryRefresh(): void {
    if (this.lifeDiaryRefreshTimer != null) window.clearTimeout(this.lifeDiaryRefreshTimer);
    this.lifeDiaryRefreshTimer = window.setTimeout(() => {
      this.lifeDiaryRefreshTimer = null;
      for (const leaf of this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)) {
        if (leaf.view instanceof BranchTimelineView && leaf.view.contentEl.querySelector(".btl-life-page")) void leaf.view.refresh();
      }
    }, 600);
  }

  private refreshSyncClouds(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)) {
      if (leaf.view instanceof BranchTimelineView) leaf.view.updateSyncCloud();
    }
  }

  checkProjectSync(date: string): void {
    this.projectTimeSync.schedule(date, [], status => {
      const message = status === "synced" ? "已写入本机项目笔记"
        : status === "idle" ? "当天没有需同步的项目工时"
          : status === "pending" ? "计时进行中，结束后同步"
            : `未同步：${this.projectTimeSync.error(date) || "请检查项目笔记"}`;
      new Notice(message);
    });
  }

  async refreshTimerStatus(): Promise<void> {
    let state: Awaited<ReturnType<StateStore["load"]>>;
    try {
      state = await this.store.load();
      this.lastStateError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "时间线状态读取失败";
      if (this.lastStateError !== message) new Notice(message);
      this.lastStateError = message;
      this.timerStatusItemId = null;
      if (this.timerStatusItem) {
        this.timerStatusItem.setText("时间线状态读取失败");
        this.timerStatusItem.removeClass("is-hidden");
      }
      return;
    }
    const todayKey = dateKey(logicalToday());
    this.reminderCache.selectDate(todayKey);
    const day = state.days[todayKey];
    const now = this.logicalMinuteNow();
    const active = day ? runningItems(day) : [];
    const primary = active[0];
    this.timerStatusItemId = primary?.id || null;
    if (this.timerStatusItem) {
      this.timerStatusItem.empty();
      this.timerStatusItem.toggleClass("is-hidden", !primary);
      if (primary && day) {
        this.timerStatusItem.createSpan({ text: `${primary.title}${active.length > 1 ? ` +${active.length - 1}` : ""}` });
        this.timerStatusItem.createEl("strong", { text: compactDuration(elapsedMinutes(primary, day, now)) });
      }
    }
    if (day) this.maybeRemindTimers(day, active, now, todayKey);
    this.maybeRemindFixed(state, todayKey, now);
  }

  private maybeRemindFixed(state: import("./types").BranchTimelineState, date: string, now: number): void {
    for (const reminder of state.fixedReminders) {
      const rule = reminderOn(reminder, date);
      if (!rule || now < rule.minute || now > rule.minute + 3) continue;
      if (state.fixedReminderResults.some(item => item.reminderId === reminder.id && item.date === date)) continue;
      const key = `${date}:${reminder.id}`;
      if (!this.reminderCache.markFixed(key)) continue;
      new Notice(`${reminder.title} · 定点提醒`, 8000);
    }
  }

  private async openRunningTimer(): Promise<void> {
    const itemId = this.timerStatusItemId;
    if (!itemId) return;
    await this.openTimelineRight(true);
    const leaf = this.app.workspace.getLeavesOfType(BRANCH_TIMELINE_VIEW)[0];
    if (leaf?.view instanceof BranchTimelineView) await leaf.view.focusRunningItem(itemId);
  }

  private maybeRemindTimers(day: import("./types").TimelineDayState, active: import("./types").TimelineItem[], now: number, date: string): void {
    const interval = this.settings.timerReminderMinutes;
    if (interval <= 0) return;
    for (const item of active) {
      const elapsed = elapsedMinutes(item, day, now);
      const bucket = Math.floor(elapsed / interval);
      if (bucket < 1) continue;
      const key = `${date}:${item.id}:${bucket}`;
      if (!this.reminderCache.markTimer(key)) continue;
      new Notice(`${item.title} · 已计时 ${compactDuration(elapsed)}`);
    }
  }

  private logicalMinuteNow(): number {
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    return minute + (now.getHours() < 2 ? 1440 : 0);
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

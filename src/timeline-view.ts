import { Menu, Notice, TFile, setIcon } from "obsidian";
import { openDateHeatmapPopover } from "./date-heatmap-popover";
import {
  ChoiceTextModal,
  MinuteEntryModal,
  TextareaEntryModal,
  TextEntryModal,
  TimelineItemDraftModal,
  type ChoiceItem,
  type ChoiceTextResult,
  type TimelineItemDraftCopy,
  type TimelineItemDraftResult
} from "./modals";
import { pageDateTitle, shiftPageDate } from "./pages/navigation";
import { absoluteMinute } from "./pages/project-model";
import { rhythmProgress, rhythmProgressLabel } from "./rhythm";
import { openRhythmSchedulePopover } from "./rhythm-popover";
import { MAX_SCALE, MIN_SCALE, TIMELINE_TOP } from "./timeline/model";
import { applyTimelineLod, updateRunningItems, updateTimelineTemporalLayers } from "./timeline/renderer";
import { BranchTimelineViewDayActions } from "./timeline-view-day-actions";
import type { ProjectRef, TimelineDayState } from "./types";
import { dateKey, logicalToday } from "./vault/format";

export { BRANCH_TIMELINE_VIEW } from "./timeline-view-base";

export class BranchTimelineView extends BranchTimelineViewDayActions {
  protected async addProject(): Promise<void> {
    const result = await this.choiceText(
      "添加项目",
      "项目名称",
      [
        { id: "planned", label: "计划" },
        { id: "active", label: "进行中" },
        { id: "done", label: "归档" },
        { id: "paused", label: "搁置" }
      ],
      "planned"
    );
    if (!result) return;
    try {
      await this.plugin.repository.createProject(result.text, result.choice, this.date);
      new Notice("项目已添加");
      window.setTimeout(() => void this.render(false), 120);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "项目创建失败");
    }
  }

  protected async addHabit(): Promise<void> {
    const name = await this.text("添加习惯", "习惯名称");
    if (!name || this.plugin.settings.habits.includes(name)) return;
    this.plugin.settings.habits.push(name);
    await this.plugin.saveSettings();
    await this.render(false);
  }

  protected async previewScale(next: number, anchorClientY: number, commit: boolean): Promise<void> {
    if (!this.scroller || !this.day) return;
    next = clampScale(next);
    if (Math.abs(next - (this.pendingScale ?? this.scale)) < 0.001 && !commit) return;
    const rect = this.scroller.getBoundingClientRect();
    const offset = anchorClientY - rect.top;
    if (!this.pendingScaleAnchor) {
      this.pendingScaleAnchor = {
        minute: (this.scroller.scrollTop + offset - TIMELINE_TOP) / this.scale + this.day.wake,
        offset
      };
    }
    this.pendingScale = next;
    const canvas = this.scroller.querySelector<HTMLElement>(".btl-canvas");
    if (canvas) {
      canvas.style.transformOrigin = `50% ${this.scroller.scrollTop + this.pendingScaleAnchor.offset}px`;
      canvas.style.transform = `scaleY(${next / this.scale})`;
      canvas.style.setProperty("--btl-preview-inverse", String(this.scale / next));
      applyTimelineLod(canvas, next);
    }
    if (commit) await this.commitScale();
  }

  protected async commitScale(): Promise<void> {
    const next = this.pendingScale;
    const anchor = this.pendingScaleAnchor;
    if (next == null || !anchor) return;
    this.pendingScale = null;
    this.pendingScaleAnchor = null;
    this.scale = next;
    localStorage.setItem("branch-timeline-hz-scale", String(next));
    await this.render(false, anchor);
  }

  protected stepScale(factor: number): void {
    const next = clampScale((this.pendingScale ?? this.scale) * factor);
    void this.previewScale(next, this.viewportCenterY(), false);
    if (this.scaleButtonTimer != null) window.clearTimeout(this.scaleButtonTimer);
    this.scaleButtonTimer = window.setTimeout(() => {
      this.scaleButtonTimer = null;
      void this.commitScale();
    }, 120);
  }

  protected openAddMenu(event: MouseEvent): void {
    const menu = new Menu();
    const minute = this.day ? this.nowOnAxis(this.day) ?? this.day.napEnd : 12 * 60;
    if (this.page === "projects") {
      if (this.selectedProjectPath && this.projectActions) {
        const at = absoluteMinute(dateKey(this.date), minute);
        menu.addItem(item => item.setTitle("添加代办").setIcon("circle-plus").onClick(() => void this.projectActions?.addTodo(at, null)));
        menu.addItem(item => item.setTitle("添加分支").setIcon("git-branch-plus").onClick(() => void this.projectActions?.addBranch(at, 1)));
        menu.showAtMouseEvent(event);
        return;
      }
      void this.addProject();
      return;
    }
    if (this.page === "achievements") {
      if (this.selectedAchievementId) {
        void this.plugin.store.load().then(state => {
          const achievement = state.achievements.find(candidate => candidate.id === this.selectedAchievementId);
          if (achievement) this.achievementActions.addRecord(achievement);
        });
      } else void this.achievementActions.add();
      return;
    }
    if (this.page === "habits") {
      void this.addHabit();
      return;
    }
    if (this.page === "policy") {
      menu.addItem(item => item.setTitle("添加根锚点").setIcon("circle-plus").onClick(() => void this.policyActions.add(true, null, this.policyPeriod, this.policySideId)));
      menu.addItem(item => item.setTitle("加入手牌").setIcon("layers").onClick(() => void this.policyActions.add(false, null, this.policyPeriod, this.policySideId)));
      menu.showAtMouseEvent(event);
      return;
    }
    menu.addItem(item => item.setTitle("添加代办").setIcon("circle-plus").onClick(() => void this.addTimelineTodo(minute, null)));
    menu.addItem(item => item.setTitle("添加分支").setIcon("git-branch-plus").onClick(() => void this.addTimelineBranch(minute)));
    menu.addItem(item => item.setTitle("添加精力区间").setIcon("layers-2").onClick(() => void this.addEnergyPhase(minute, 1)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("记录项目工时").setIcon("timer").onClick(() => void this.plugin.recordProjectWork(this.date)));
    menu.addItem(item => item.setTitle("记录分类时长").setIcon("tags").onClick(() => void this.plugin.recordCategoryDuration(this.date)));
    menu.addItem(item => item.setTitle("打卡习惯").setIcon("check-circle").onClick(() => void this.plugin.toggleHabit(this.date)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("添加项目待办").setIcon("list-plus").onClick(() => void this.plugin.addProjectTask(this.date)));
    menu.showAtMouseEvent(event);
  }

  protected shiftDate(amount: number): void {
    this.followsToday = false;
    this.date = shiftPageDate(this.date, this.page, amount);
    void this.render(false);
  }

  protected dateTitle(): string {
    return pageDateTitle(this.date, this.page);
  }

  protected async openDatePicker(anchor: HTMLElement): Promise<void> {
    const state = await this.plugin.store.load();
    openDateHeatmapPopover(anchor, this.date, state, date => {
      this.date = date;
      this.followsToday = dateKey(date) === dateKey(logicalToday());
      void this.render(false);
    });
  }

  protected nowOnAxis(day: TimelineDayState): number | undefined {
    const minute = this.currentLogicalMinute();
    if (minute == null) return undefined;
    return minute >= day.wake ? minute : undefined;
  }

  protected gapHorizon(day: TimelineDayState): number | undefined {
    const selected = dateKey(this.date);
    const today = dateKey(logicalToday());
    if (selected > today) return undefined;
    if (selected < today) return day.sleep;
    return this.nowOnAxis(day);
  }

  protected currentLogicalMinute(): number | undefined {
    if (dateKey(this.date) !== dateKey(logicalToday())) return undefined;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  }

  protected viewportCenterY(): number {
    const rect = this.scroller?.getBoundingClientRect();
    return rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  }

  protected updateCountdown(): void {
    const button = this.countdownButton;
    if (!button) return;
    const now = new Date();
    const progress = rhythmProgress(this.plugin.settings.rhythm, now);
    button.querySelector("span")?.setText(progress.mode === "elapsed"
      ? this.plugin.settings.rhythmElapsedMark
      : this.plugin.settings.rhythmRemainingMark);
    button.querySelector("strong")?.setText(rhythmProgressLabel(this.plugin.settings.rhythm, now));
    button.toggleClass("is-elapsed", progress.mode === "elapsed");
  }

  protected updateTimelineClock(): void {
    if (this.page !== "day" || !this.day || !this.scroller) return;
    const canvas = this.scroller.querySelector<HTMLElement>(".btl-canvas");
    if (!canvas) return;
    const now = this.nowOnAxis(this.day);
    updateTimelineTemporalLayers(canvas, this.day, this.scale, now, this.gapHorizon(this.day));
    updateRunningItems(canvas, this.day, this.scale, now);
  }

  protected async toggleProjectPin(path: string): Promise<void> {
    const pinned = new Set(this.plugin.settings.pinnedProjects);
    if (pinned.has(path)) pinned.delete(path);
    else pinned.add(path);
    this.plugin.settings.pinnedProjects = [...pinned];
    await this.plugin.saveSettings();
  }

  protected async openProjectFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice("项目文件不存在");
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  protected async toggleProjectGroup(label: string): Promise<void> {
    const collapsed = new Set(this.plugin.settings.collapsedProjectGroups);
    if (collapsed.has(label)) collapsed.delete(label);
    else collapsed.add(label);
    this.plugin.settings.collapsedProjectGroups = [...collapsed];
    await this.plugin.saveSettings();
  }

  protected async reorderProjects(paths: string[]): Promise<void> {
    const moved = new Set(paths);
    this.plugin.settings.projectOrder = [...this.plugin.settings.projectOrder.filter(path => !moved.has(path)), ...paths];
    await this.plugin.saveSettings(false);
  }

  protected async reorderHabits(names: string[]): Promise<void> {
    const moved = new Set(names);
    this.plugin.settings.habits = [...names, ...this.plugin.settings.habits.filter(name => !moved.has(name))];
    await this.plugin.saveSettings();
  }

  protected async reorderHabitCards(ids: string[]): Promise<void> {
    this.plugin.settings.habitCardOrder = ids;
    await this.plugin.saveSettings();
  }

  protected openPluginSettings(): void {
    const settings = (this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
    settings.open();
    settings.openTabById(this.plugin.manifest.id);
  }

  protected openPolicySideMenu(side: import("./types").PolicySide, event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.policyActions.renameSide(side)));
    menu.addItem(item => item.setTitle(side.mode === "dayparts" ? "改为普通场景" : "启用时段").setIcon("columns-3").onClick(() => void this.policyActions.toggleSideMode(side)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除场景").setIcon("trash-2").setWarning(true).onClick(() => void this.policyActions.deleteSide(side)));
    menu.showAtMouseEvent(event);
  }

  protected async setPolicySceneWidth(sideId: string, width: number): Promise<void> {
    this.plugin.settings.policySceneWidths = { ...this.plugin.settings.policySceneWidths, [sideId]: width };
    await this.plugin.saveSettings();
  }

  protected openRhythmSettings(anchor: HTMLElement): void {
    openRhythmSchedulePopover(anchor, this.plugin.settings.rhythm, async next => {
      this.plugin.settings.rhythm = next;
      await this.plugin.saveSettings();
    }, undefined, this.plugin.settings.rhythmLabels);
  }

  protected text(title: string, placeholder: string, value = ""): Promise<string | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: string | null) => { if (!settled) { settled = true; resolve(result); } };
      const modal = new TextEntryModal(this.app, title, placeholder, finish, value);
      const close = modal.onClose.bind(modal);
      modal.onClose = () => { close(); finish(null); };
      modal.open();
    });
  }

  protected note(title: string, placeholder: string, value = ""): Promise<string | null> {
    return new Promise(resolve => new TextareaEntryModal(this.app, title, placeholder, resolve, value).open());
  }

  protected timelineItemDraft(projects: readonly ProjectRef[], copy?: TimelineItemDraftCopy): Promise<TimelineItemDraftResult | null> {
    return new Promise(resolve => new TimelineItemDraftModal(
      this.app,
      projects,
      this.plugin.settings.tags,
      this.plugin.settings.itemMetadataRequirement,
      resolve,
      copy
    ).open());
  }

  protected choiceText(
    title: string,
    placeholder: string,
    choices: readonly ChoiceItem[],
    selected: string,
    value = ""
  ): Promise<ChoiceTextResult | null> {
    return new Promise(resolve => new ChoiceTextModal(this.app, title, placeholder, choices, selected, resolve, value).open());
  }

  protected minutes(title: string): Promise<number | null> {
    return new Promise(resolve => new MinuteEntryModal(this.app, title, resolve).open());
  }

  protected iconButton(parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "btl-icon-button", attr: { "aria-label": label, title: label } });
    setIcon(button, icon);
    button.onclick = action;
    return button;
  }

  protected uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

function clampScale(value: number): number { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); }

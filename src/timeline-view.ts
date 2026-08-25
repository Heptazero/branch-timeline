import { ItemView, Menu, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { openDateHeatmapPopover } from "./date-heatmap-popover";
import {
  ChoiceTextModal,
  ConfirmModal,
  MinuteEntryModal,
  TextareaEntryModal,
  TextEntryModal,
  TimelineItemDraftModal,
  type ChoiceItem,
  type ChoiceTextResult,
  type TimelineItemDraftResult
} from "./modals";
import { AchievementActions } from "./pages/achievement-actions";
import { renderAchievementsPage } from "./pages/achievements";
import { renderHabitsPage } from "./pages/habits";
import { pageDateTitle, renderPageNavigation, shiftPageDate, type TimelinePage } from "./pages/navigation";
import { ProjectTimelineActions } from "./pages/project-actions";
import {
  PROJECT_SCALE_MAX,
  PROJECT_SCALE_MIN,
  renderProjectDetail,
  type ProjectScaleAnchor
} from "./pages/project-detail";
import { absoluteMinute } from "./pages/project-model";
import { renderProjectsPage } from "./pages/projects";
import { policyPeriodAt, renderPolicyPage } from "./pages/policy";
import { PolicyActions } from "./pages/policy-actions";
import { rhythmProgress, rhythmProgressLabel, rhythmRealKey } from "./rhythm";
import { openRhythmSchedulePopover } from "./rhythm-popover";
import { TimelineGestures } from "./timeline/gestures";
import { MAX_SCALE, MIN_SCALE, TIMELINE_TOP, backfillItem as applyBackfill, clampMinute, minuteToY } from "./timeline/model";
import { showBranchMenu, showItemMenu } from "./timeline/menu";
import { applyTimelineLod, renderTimeline } from "./timeline/renderer";
import type { ProjectRef, RhythmKey, TimelineBranch, TimelineDayState, TimelineItem } from "./types";
import { dateKey, logicalToday } from "./vault/format";
import { defaultDay } from "./vault/state-store";

export const BRANCH_TIMELINE_VIEW = "branch-timeline-hz-view";
const BRANCH_COLORS = ["#3b6ea5", "#a5573b", "#7a3ba5", "#2e8b74", "#a53b6e"];

interface ScrollAnchor { minute: number; offset: number }

export class BranchTimelineView extends ItemView {
  private date = logicalToday();
  private scale = clampScale(Number(localStorage.getItem("branch-timeline-hz-scale")) || 1.4);
  private gestures: TimelineGestures | null = null;
  private scroller: HTMLElement | null = null;
  private day: TimelineDayState | null = null;
  private renderId = 0;
  private page: TimelinePage = "day";
  private pendingScale: number | null = null;
  private pendingScaleAnchor: ScrollAnchor | null = null;
  private scaleButtonTimer: number | null = null;
  private clockTimer: number | null = null;
  private followsToday = true;
  private selectedProjectPath: string | null = null;
  private projectScale = clampProjectScale(Number(localStorage.getItem("branch-timeline-hz-project-scale")) || 120);
  private projectAnchor: ProjectScaleAnchor | undefined;
  private getProjectAnchor: (() => ProjectScaleAnchor) | null = null;
  private destroyProjectDetail: (() => void) | null = null;
  private projectActions: ProjectTimelineActions | null = null;
  private countdownButton: HTMLButtonElement | null = null;
  private achievementActions: AchievementActions;
  private policyActions: PolicyActions;
  private policySideId = localStorage.getItem("branch-timeline-hz-policy-side") || "policy-side-routine";
  private policyPeriod = policyPeriodAt(new Date());

  constructor(leaf: WorkspaceLeaf, private plugin: BranchTimelinePlugin) {
    super(leaf);
    const shared = {
      app: this.app,
      plugin: this.plugin,
      getDate: () => this.date,
      refresh: () => this.render(false),
      text: (title: string, placeholder: string, value?: string) => this.text(title, placeholder, value)
    };
    this.achievementActions = new AchievementActions({ ...shared, colors: BRANCH_COLORS });
    this.policyActions = new PolicyActions(shared);
  }
  getViewType(): string { return BRANCH_TIMELINE_VIEW; }
  getDisplayText(): string { return "Branch Timeline"; }
  getIcon(): string { return "git-branch"; }
  async onOpen(): Promise<void> {
    await this.render(false);
    this.clockTimer = window.setInterval(() => {
      const today = logicalToday();
      if (this.followsToday && dateKey(this.date) !== dateKey(today)) {
        this.date = today;
        void this.render(false);
        return;
      }
      this.updateCountdown();
      if (this.page === "day" && this.day?.items.some(item => item.factTiming || item.startedMin != null)) void this.render(true);
    }, 60_000);
  }
  async onClose(): Promise<void> {
    this.gestures?.destroy();
    this.destroyProjectDetail?.();
    if (this.clockTimer != null) window.clearInterval(this.clockTimer);
    if (this.scaleButtonTimer != null) window.clearTimeout(this.scaleButtonTimer);
  }
  async refresh(): Promise<void> { await this.render(true); }

  private async render(preserveScroll: boolean, anchor?: ScrollAnchor): Promise<void> {
    const requestId = ++this.renderId;
    const previousScroll = preserveScroll ? this.scroller?.scrollTop || 0 : 0;
    this.gestures?.destroy();
    this.gestures = null;
    this.destroyProjectDetail?.();
    this.destroyProjectDetail = null;
    this.getProjectAnchor = null;
    this.projectActions = null;
    this.countdownButton = null;
    if (!this.plugin.settings.visiblePages.includes(this.page)) {
      this.page = "day";
      this.selectedProjectPath = null;
    }

    const root = this.contentEl;
    root.empty();
    root.addClass("branch-timeline-hz");
    const toolbar = root.createDiv({ cls: "btl-toolbar" });
    const undo = this.iconButton(toolbar, "undo-2", "撤回", () => void this.plugin.undoLast());
    undo.addClass("btl-undo-button");
    undo.disabled = !this.plugin.undoManager.canUndo;
    const dateNav = toolbar.createDiv({ cls: "btl-date-nav" });
    this.iconButton(dateNav, "chevron-left", "前一天", () => this.shiftDate(-1));
    const dateButton = dateNav.createEl("button", { cls: "btl-date-button", text: this.dateTitle() });
    dateButton.onclick = () => void this.openDatePicker(dateButton);
    this.iconButton(dateNav, "chevron-right", "后一天", () => this.shiftDate(1));
    const toolbarActions = toolbar.createDiv({ cls: "btl-toolbar-actions" });
    this.iconButton(toolbarActions, "settings", "设置", () => this.openPluginSettings());
    const add = this.iconButton(toolbarActions, "plus", "添加", event => this.openAddMenu(event));
    add.addClass("btl-add-button");

    const navigationRow = root.createDiv({ cls: "btl-page-nav-row" });
    renderPageNavigation(navigationRow, this.page, page => {
      this.page = page;
      if (page !== "projects") this.selectedProjectPath = null;
      void this.render(false);
    }, this.plugin.settings.visiblePages);
    this.countdownButton = navigationRow.createEl("button", { cls: "btl-day-countdown", attr: { "aria-label": "设置节律" } });
    this.countdownButton.createSpan();
    this.countdownButton.createEl("strong");
    this.countdownButton.onclick = () => this.openRhythmSettings(this.countdownButton!);
    this.updateCountdown();

    const pageContent = root.createDiv({ cls: "btl-page-content" });

    const state = await this.plugin.store.load();
    if (requestId !== this.renderId) return;
    const key = dateKey(this.date);
    const day = state.days[key] || defaultDay(this.plugin.settings.rhythm);
    this.day = day;

    if (this.page !== "day") {
      this.scroller = null;
      if (this.page === "projects") {
        const projects = this.plugin.repository.listProjects();
        const project = this.selectedProjectPath ? projects.find(candidate => candidate.path === this.selectedProjectPath) : undefined;
        if (project) {
          const actions = new ProjectTimelineActions({
            app: this.app,
            plugin: this.plugin,
            projectPath: project.path,
            getAnchor: () => this.getProjectAnchor?.(),
            setAnchor: anchorValue => { this.projectAnchor = anchorValue; },
            refresh: () => this.render(false),
            text: (title, placeholder, value) => this.text(title, placeholder, value),
            note: (title, placeholder, value) => this.note(title, placeholder, value)
          });
          this.projectActions = actions;
          const detail = renderProjectDetail({
            container: pageContent,
            project,
            state,
            tags: this.plugin.settings.tags,
            focusDate: this.date,
            scale: this.projectScale,
            anchor: this.projectAnchor,
            onBack: () => { this.selectedProjectPath = null; this.projectAnchor = undefined; this.projectActions = null; void this.render(false); },
            onScale: (scale, nextAnchor) => { this.projectScale = clampProjectScale(scale); this.projectAnchor = nextAnchor; localStorage.setItem("branch-timeline-hz-project-scale", String(this.projectScale)); void this.render(false); },
            onMoveItem: (date, itemId, branchId) => void actions.moveItem(date, itemId, branchId),
            onItemNote: entry => void actions.editNote(entry.date, entry.item),
            onItemMenu: (entry, event) => actions.openItemMenu(entry, event),
            onBranchMenu: (branch, event) => actions.openBranchMenu(branch, event),
            onBranchOffset: (branchId, offsetX) => void actions.updateBranch(branchId, branch => { branch.offsetX = offsetX; }),
            onBranchStart: (branchId, startAbs) => void actions.updateBranch(branchId, branch => { branch.startAbs = startAbs; }),
            onBranchEnd: (branchId, endAbs, toggleMerge) => void actions.updateBranch(branchId, branch => {
              if (toggleMerge) branch.merged = !branch.merged;
              else branch.endAbs = endAbs;
            }),
            onBranchFlip: branchId => void actions.updateBranch(branchId, branch => { branch.side = branch.side > 0 ? -1 : 1; }),
            onAddTodo: (abs, branchId) => void actions.addTodo(abs, branchId),
            onAddBranch: (abs, side) => void actions.addBranch(abs, side)
          });
          this.destroyProjectDetail = detail.destroy;
          this.getProjectAnchor = detail.getAnchor;
          this.projectAnchor = undefined;
        } else {
          this.selectedProjectPath = null;
          renderProjectsPage({
            container: pageContent,
            projects,
            state,
            projectOrder: this.plugin.settings.projectOrder,
            projectTypes: this.plugin.settings.projectTypes,
            pinnedProjects: this.plugin.settings.pinnedProjects,
            collapsedGroups: this.plugin.settings.collapsedProjectGroups,
            focusDate: this.date,
            showProjectLog: this.plugin.settings.showProjectLogHeatmap,
            openProject: path => {
              this.selectedProjectPath = path;
              this.projectAnchor = undefined;
              void this.render(false);
            },
            openProjectFile: path => void this.openProjectFile(path),
            onTogglePin: path => void this.toggleProjectPin(path),
            onToggleGroup: label => void this.toggleProjectGroup(label),
            onReorder: paths => void this.reorderProjects(paths)
          });
        }
      } else if (this.page === "habits") {
        await renderHabitsPage({
          container: pageContent,
          date: this.date,
          habits: this.plugin.settings.habits,
          tags: this.plugin.settings.tags,
          state,
          cardOrder: this.plugin.settings.habitCardOrder,
          readDay: date => this.plugin.repository.readDiaryDay(date),
          setHabit: (date, habit, done) => this.plugin.repository.setHabit(date, habit, done),
          togglePolicyHabit: (cardId, date) => this.policyActions.toggleHabitOn(cardId, date),
          isCurrent: () => requestId === this.renderId,
          refresh: () => this.render(false),
          onAdd: () => void this.addHabit(),
          onReorderHabits: names => void this.reorderHabits(names),
          onReorderCards: ids => void this.reorderHabitCards(ids),
          onEditTags: () => this.openPluginSettings()
        });
      }
      else if (this.page === "achievements") {
        renderAchievementsPage({
          container: pageContent,
          date: this.date,
          achievements: state.achievements,
          onAdd: () => void this.achievementActions.add(),
          onToggle: (achievementId, date) => void this.achievementActions.toggle(achievementId, date),
          onMenu: (achievement, event) => this.achievementActions.openMenu(achievement, event)
        });
      } else {
        const activeSide = state.policySides.find(side => side.id === this.policySideId) || state.policySides[0];
        this.policySideId = activeSide?.id || "policy-side-routine";
        renderPolicyPage({
          container: pageContent,
          cards: state.policyCards,
          nodes: state.policyNodes,
          sides: state.policySides,
          events: state.policyEvents,
          date: key,
          activeSideId: this.policySideId,
          activePeriod: this.policyPeriod,
          sceneWidths: this.plugin.settings.policySceneWidths,
          onSelectSide: sideId => {
            this.policySideId = sideId;
            localStorage.setItem("branch-timeline-hz-policy-side", sideId);
            void this.render(false);
          },
          onSelectPeriod: period => { this.policyPeriod = period; void this.render(false); },
          onAddSide: () => void this.policyActions.addSide(),
          onSideMenu: (side, event) => this.openPolicySideMenu(side, event),
          onSceneWidth: (sideId, width) => void this.setPolicySceneWidth(sideId, width),
          onAddRoot: (period, sideId) => void this.policyActions.add(true, null, period, sideId),
          onAddHand: sideId => void this.policyActions.add(false, null, this.policyPeriod, sideId),
          onAddChild: (parentId, period, sideId) => void this.policyActions.add(true, parentId, period, sideId),
          onDeploy: (cardId, parentId, period, sideId) => void this.policyActions.deployTo(cardId, parentId, period, sideId),
          onMoveNode: (nodeId, parentId, period, sideId) => void this.policyActions.moveNode(nodeId, parentId, period, sideId),
          onToggleNode: (node, card) => void this.policyActions.toggleSettlement(node, card),
          onNodeMenu: (node, card, event) => this.policyActions.openNodeMenu(node, card, event),
          onCardMenu: (card, event) => this.policyActions.openCardMenu(card, event)
        });
      }
      return;
    }

    const scroller = pageContent.createDiv({ cls: "btl-timeline-scroller" });
    this.scroller = scroller;
    const width = Math.max(280, scroller.clientWidth || root.clientWidth || 390);
    const nowMinute = this.nowOnAxis(day);
    const rendered = renderTimeline(scroller, {
      day,
      tags: this.plugin.settings.tags,
      scale: this.scale,
      width,
      nowMinute,
      rhythmLabels: this.plugin.settings.rhythmLabels
    });
    this.gestures = new TimelineGestures(scroller, rendered.canvas, day, rendered.layout, {
      onItemMove: (itemId, startMin, branchId) => void this.moveItem(itemId, startMin, branchId),
      onItemResize: (itemId, edge, minute) => void this.resizeItem(itemId, edge, minute),
      onItemComplete: itemId => void this.completeItem(itemId),
      onItemNote: itemId => void this.editItemNote(itemId),
      onItemMenu: (itemId, event) => this.openItemMenu(itemId, event),
      onBranchOffset: (branchId, offsetX) => void this.updateBranch(branchId, branch => { branch.offsetX = offsetX; }),
      onBranchStart: (branchId, minute) => void this.updateBranch(branchId, branch => { branch.startMin = minute; }),
      onBranchEnd: (branchId, minute) => void this.updateBranch(branchId, branch => { branch.endMin = minute; }),
      onBranchFlip: branchId => void this.updateBranch(branchId, branch => { branch.side = branch.side > 0 ? -1 : 1; }),
      onBranchMenu: (branchId, event) => this.openBranchMenu(branchId, event),
      onRhythm: (rhythm, minute, moved) => void this.updateRhythm(rhythm, minute, moved),
      onAddTodo: (minute, branchId) => void this.addTimelineTodo(minute, branchId),
      onAddBranch: minute => void this.addTimelineBranch(minute),
      onScale: (scale, anchorClientY, commit) => void this.previewScale(scale, anchorClientY, commit)
    });

    const zoom = root.createDiv({ cls: "btl-zoom-controls" });
    this.iconButton(zoom, "minus", "缩小", () => this.stepScale(1 / 1.28));
    this.iconButton(zoom, "plus", "放大", () => this.stepScale(1.28));

    window.requestAnimationFrame(() => {
      if (requestId !== this.renderId || !this.scroller) return;
      if (anchor) {
        this.scroller.scrollTop = minuteToY(day, this.scale, anchor.minute) - anchor.offset;
      } else if (preserveScroll) {
        this.scroller.scrollTop = previousScroll;
      } else {
        const focusMinute = nowMinute ?? day.napEnd;
        this.scroller.scrollTop = Math.max(0, minuteToY(day, this.scale, focusMinute) - this.scroller.clientHeight * 0.38);
      }
    });
  }

  private async moveItem(itemId: string, startMin: number, branchId: string | null): Promise<void> {
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item) return;
      if (item.kind === "fact") {
        const oldStart = item.startMin ?? item.endMin ?? startMin;
        const duration = Math.max(0, (item.endMin ?? oldStart) - oldStart);
        item.startMin = startMin;
        item.endMin = Math.min(day.sleep, startMin + duration);
      } else if (item.startedMin != null) {
        item.startedMin = startMin;
      } else {
        item.plannedMin = startMin;
      }
      item.branchId = branchId;
    });
  }

  private async resizeItem(itemId: string, edge: "start" | "end", minute: number): Promise<void> {
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item || item.kind !== "fact") return;
      if (edge === "start") item.startMin = Math.min(minute, (item.endMin ?? minute + 5) - 5);
      else item.endMin = Math.max(minute, (item.startMin ?? minute - 5) + 5);
    });
  }

  private async completeItem(itemId: string): Promise<void> {
    const item = this.day?.items.find(candidate => candidate.id === itemId);
    if (!item || item.kind === "fact") return;
    if (item.projectPath && item.projectTaskId) {
      try { await this.plugin.repository.setProjectTaskDone(item.projectPath, item.projectTaskId, true); }
      catch (error) { new Notice(error instanceof Error ? error.message : "项目待办更新失败"); return; }
    }
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (!target) return;
      const end = this.nowOnAxis(day) ?? target.plannedMin ?? day.napEnd;
      target.kind = "fact";
      target.startMin = target.startedMin ?? end;
      target.endMin = end;
      target.factTiming = false;
      delete target.startedMin;
    });
  }

  private async startTiming(itemId: string): Promise<void> {
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (!target) return;
      const now = this.nowOnAxis(day) ?? target.plannedMin ?? target.endMin ?? day.napEnd;
      if (target.kind === "todo") {
        target.startedMin = now;
        return;
      }
      const start = target.startMin ?? target.endMin ?? now;
      const end = target.endMin ?? start;
      if (end > start) {
        day.items.push({
          ...target,
          id: this.uid("fact"),
          startMin: now,
          endMin: now,
          factTiming: true,
          projectTaskId: undefined
        });
      } else {
        target.startMin = now;
        target.endMin = now;
        target.factTiming = true;
      }
    });
  }

  private async stopTiming(itemId: string): Promise<void> {
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (!target || target.kind !== "fact" || !target.factTiming) return;
      target.endMin = this.nowOnAxis(day) ?? target.endMin ?? target.startMin;
      target.factTiming = false;
    });
  }

  private async cancelTiming(itemId: string): Promise<void> {
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (target?.kind === "todo") delete target.startedMin;
    });
  }

  private openItemMenu(itemId: string, event: MouseEvent): void {
    const item = this.day?.items.find(candidate => candidate.id === itemId);
    if (!item) return;
    showItemMenu(event, item, this.plugin.settings.tags, this.plugin.repository.listProjects(), {
      complete: () => void this.completeItem(item.id),
      startTiming: () => void this.startTiming(item.id),
      stopTiming: () => void this.stopTiming(item.id),
      cancelTiming: () => void this.cancelTiming(item.id),
      backfill: () => void this.backfillItem(item.id),
      ...(item.projectPath ? { toggleMilestone: () => void this.updateDay(day => {
        const target = day.items.find(candidate => candidate.id === item.id);
        if (target) target.milestone = !target.milestone;
      }) } : {}),
      rename: () => void this.renameItem(item),
      setProject: projectPath => void this.setItemProject(item.id, projectPath),
      setTag: tagId => void this.setItemTag(item.id, tagId),
      remove: () => this.confirmRemoveItem(item)
    });
  }

  private openBranchMenu(branchId: string, event: MouseEvent): void {
    const branch = this.day?.branches.find(candidate => candidate.id === branchId);
    if (!branch) return;
    showBranchMenu(event, branch, {
      rename: () => void this.renameBranch(branch),
      flip: () => void this.updateBranch(branch.id, target => { target.side = target.side > 0 ? -1 : 1; }),
      remove: () => this.confirmRemoveBranch(branch)
    });
  }

  private async setItemTag(itemId: string, tagId: string | null): Promise<void> {
    const tag = tagId ? this.plugin.settings.tags.find(candidate => candidate.id === tagId) : undefined;
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item) return;
      item.tagId = tag?.id;
      item.tag = tag?.name;
    });
  }

  private async setItemProject(itemId: string, projectPath: string | null): Promise<void> {
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item || item.projectPath === projectPath) return;
      item.projectPath = projectPath || undefined;
      item.projectBranchId = null;
      item.projectTaskId = undefined;
      if (!projectPath) item.milestone = false;
    });
  }

  private async backfillItem(itemId: string): Promise<void> {
    const item = this.day?.items.find(candidate => candidate.id === itemId);
    if (!item) return;
    const minutes = await this.minutes(`补记 · ${item.title}`);
    if (minutes == null) return;
    if (item.kind === "todo" && item.projectPath && item.projectTaskId) {
      try { await this.plugin.repository.setProjectTaskDone(item.projectPath, item.projectTaskId, true); }
      catch (error) { new Notice(error instanceof Error ? error.message : "项目待办更新失败"); return; }
    }
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (!target) return;
      const end = this.nowOnAxis(day) ?? target.endMin ?? target.plannedMin ?? day.napEnd;
      applyBackfill(target, end, minutes, day.wake);
    });
  }

  private async renameItem(item: TimelineItem): Promise<void> {
    const value = await this.text("重命名", "标题", item.title);
    if (value == null) return;
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === item.id);
      if (target) target.title = value;
    });
  }

  private async editItemNote(itemId: string): Promise<void> {
    const item = this.day?.items.find(candidate => candidate.id === itemId);
    if (!item) return;
    const note = await this.note("备注", "写点什么", item.note || "");
    if (note == null) return;
    if (item.projectPath) {
      try {
        const minute = item.startMin ?? item.startedMin ?? item.plannedMin ?? item.endMin ?? this.day?.wake ?? 0;
        await this.plugin.repository.syncProjectNote(item.projectPath, this.date, minute, item.note || "", note);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "项目备注同步失败");
        return;
      }
    }
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (target) target.note = note.trim() || undefined;
    });
  }

  private async renameBranch(branch: TimelineBranch): Promise<void> {
    const value = await this.text("重命名分支", "分支名称", branch.name);
    if (value == null) return;
    await this.updateBranch(branch.id, target => { target.name = value; });
  }

  private confirmRemoveItem(item: TimelineItem): void {
    new ConfirmModal(
      this.app,
      `删除“${item.title}”？`,
      item.projectTaskId ? "只从时间轴移除；项目笔记中的待办保留。" : "这条时间轴记录会被删除。",
      () => this.updateDay(day => { day.items = day.items.filter(candidate => candidate.id !== item.id); })
    ).open();
  }

  private confirmRemoveBranch(branch: TimelineBranch): void {
    new ConfirmModal(
      this.app,
      `删除“${branch.name}”？`,
      "分支上的事项会回到主线，事项本身不会删除。",
      () => this.updateDay(day => {
        for (const item of day.items) if (item.branchId === branch.id) item.branchId = null;
        day.branches = day.branches.filter(candidate => candidate.id !== branch.id);
      })
    ).open();
  }

  private async updateBranch(branchId: string, mutate: (branch: TimelineBranch) => void): Promise<void> {
    await this.updateDay(day => {
      const branch = day.branches.find(candidate => candidate.id === branchId);
      if (branch) mutate(branch);
    });
  }

  private async updateRhythm(key: RhythmKey, minute: number, moved: boolean): Promise<void> {
    await this.updateDay(day => {
      const realKey = rhythmRealKey(key);
      if (moved) {
        day[key] = minute;
        day[realKey] = true;
      } else if (day[realKey]) {
        day[realKey] = false;
      } else {
        const now = this.currentLogicalMinute();
        if (now != null) day[key] = now;
        day[realKey] = true;
      }
    });
  }

  private async addTimelineTodo(minute: number, branchId: string | null): Promise<void> {
    const projects = this.plugin.repository.listProjects().filter(project =>
      ["active", "doing", "进行中"].includes(project.status.trim().toLowerCase())
    );
    const draft = await this.timelineItemDraft(projects);
    if (!draft) return;
    const tag = draft.tagId ? this.plugin.settings.tags.find(candidate => candidate.id === draft.tagId) : undefined;
    if (draft.projectPath && draft.note) {
      try {
        await this.plugin.repository.syncProjectNote(draft.projectPath, this.date, minute, "", draft.note);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "项目备注同步失败");
        return;
      }
    }
    await this.updateDay(day => {
      day.items.push({
        id: this.uid("todo"),
        title: draft.title,
        kind: "todo",
        plannedMin: minute,
        branchId,
        projectPath: draft.projectPath || undefined,
        tagId: tag?.id,
        tag: tag?.name,
        note: draft.note || undefined
      });
    });
  }

  private async addTimelineBranch(minute: number): Promise<void> {
    const name = await this.text("添加分支", "分支名称");
    if (!name) return;
    await this.updateDay(day => {
      day.branches.push({
        id: this.uid("branch"), name, startMin: minute, endMin: null,
        side: day.branches.length % 2 === 0 ? 1 : -1,
        color: BRANCH_COLORS[day.branches.length % BRANCH_COLORS.length]
      });
    });
  }

  private async updateDay(mutator: (day: TimelineDayState) => void): Promise<void> {
    const key = dateKey(this.date);
    await this.plugin.store.update(state => {
      const day = state.days[key] ||= defaultDay(this.plugin.settings.rhythm);
      mutator(day);
    });
    await this.render(true);
  }

  private async addProject(): Promise<void> {
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

  private async addHabit(): Promise<void> {
    const name = await this.text("添加习惯", "习惯名称");
    if (!name || this.plugin.settings.habits.includes(name)) return;
    this.plugin.settings.habits.push(name);
    await this.plugin.saveSettings();
    await this.render(false);
  }

  private async previewScale(next: number, anchorClientY: number, commit: boolean): Promise<void> {
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

  private async commitScale(): Promise<void> {
    const next = this.pendingScale;
    const anchor = this.pendingScaleAnchor;
    if (next == null || !anchor) return;
    this.pendingScale = null;
    this.pendingScaleAnchor = null;
    this.scale = next;
    localStorage.setItem("branch-timeline-hz-scale", String(next));
    await this.render(false, anchor);
  }

  private stepScale(factor: number): void {
    const next = clampScale((this.pendingScale ?? this.scale) * factor);
    void this.previewScale(next, this.viewportCenterY(), false);
    if (this.scaleButtonTimer != null) window.clearTimeout(this.scaleButtonTimer);
    this.scaleButtonTimer = window.setTimeout(() => {
      this.scaleButtonTimer = null;
      void this.commitScale();
    }, 120);
  }

  private openAddMenu(event: MouseEvent): void {
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
      void this.achievementActions.add();
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
    menu.addSeparator();
    menu.addItem(item => item.setTitle("记录项目工时").setIcon("timer").onClick(() => void this.plugin.recordProjectWork(this.date)));
    menu.addItem(item => item.setTitle("记录分类时长").setIcon("tags").onClick(() => void this.plugin.recordCategoryDuration(this.date)));
    menu.addItem(item => item.setTitle("打卡习惯").setIcon("check-circle").onClick(() => void this.plugin.toggleHabit(this.date)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("添加项目待办").setIcon("list-plus").onClick(() => void this.plugin.addProjectTask(this.date)));
    menu.showAtMouseEvent(event);
  }

  private shiftDate(amount: number): void {
    this.followsToday = false;
    this.date = shiftPageDate(this.date, this.page, amount);
    void this.render(false);
  }

  private dateTitle(): string {
    return pageDateTitle(this.date, this.page);
  }

  private async openDatePicker(anchor: HTMLElement): Promise<void> {
    const state = await this.plugin.store.load();
    openDateHeatmapPopover(anchor, this.date, state, date => {
      this.date = date;
      this.followsToday = dateKey(date) === dateKey(logicalToday());
      void this.render(false);
    });
  }

  private nowOnAxis(day: TimelineDayState): number | undefined {
    const minute = this.currentLogicalMinute();
    if (minute == null) return undefined;
    return minute >= day.wake && minute <= day.sleep ? minute : undefined;
  }

  private currentLogicalMinute(): number | undefined {
    if (dateKey(this.date) !== dateKey(logicalToday())) return undefined;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
  }

  private viewportCenterY(): number {
    const rect = this.scroller?.getBoundingClientRect();
    return rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  }

  private updateCountdown(): void {
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

  private async toggleProjectPin(path: string): Promise<void> {
    const pinned = new Set(this.plugin.settings.pinnedProjects);
    if (pinned.has(path)) pinned.delete(path);
    else pinned.add(path);
    this.plugin.settings.pinnedProjects = [...pinned];
    await this.plugin.saveSettings();
  }

  private async openProjectFile(path: string): Promise<void> {
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

  private async toggleProjectGroup(label: string): Promise<void> {
    const collapsed = new Set(this.plugin.settings.collapsedProjectGroups);
    if (collapsed.has(label)) collapsed.delete(label);
    else collapsed.add(label);
    this.plugin.settings.collapsedProjectGroups = [...collapsed];
    await this.plugin.saveSettings();
  }

  private async reorderProjects(paths: string[]): Promise<void> {
    const moved = new Set(paths);
    this.plugin.settings.projectOrder = [...this.plugin.settings.projectOrder.filter(path => !moved.has(path)), ...paths];
    await this.plugin.saveSettings(false);
  }

  private async reorderHabits(names: string[]): Promise<void> {
    const moved = new Set(names);
    this.plugin.settings.habits = [...names, ...this.plugin.settings.habits.filter(name => !moved.has(name))];
    await this.plugin.saveSettings();
  }

  private async reorderHabitCards(ids: string[]): Promise<void> {
    this.plugin.settings.habitCardOrder = ids;
    await this.plugin.saveSettings();
  }

  private openPluginSettings(): void {
    const settings = (this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
    settings.open();
    settings.openTabById(this.plugin.manifest.id);
  }

  private openPolicySideMenu(side: import("./types").PolicySide, event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.policyActions.renameSide(side)));
    menu.addItem(item => item.setTitle(side.mode === "dayparts" ? "改为普通场景" : "启用时段").setIcon("columns-3").onClick(() => void this.policyActions.toggleSideMode(side)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除场景").setIcon("trash-2").setWarning(true).onClick(() => void this.policyActions.deleteSide(side)));
    menu.showAtMouseEvent(event);
  }

  private async setPolicySceneWidth(sideId: string, width: number): Promise<void> {
    this.plugin.settings.policySceneWidths = { ...this.plugin.settings.policySceneWidths, [sideId]: width };
    await this.plugin.saveSettings();
  }

  private openRhythmSettings(anchor: HTMLElement): void {
    openRhythmSchedulePopover(anchor, this.plugin.settings.rhythm, async next => {
      this.plugin.settings.rhythm = next;
      await this.plugin.saveSettings();
    }, undefined, this.plugin.settings.rhythmLabels);
  }

  private text(title: string, placeholder: string, value = ""): Promise<string | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: string | null) => { if (!settled) { settled = true; resolve(result); } };
      const modal = new TextEntryModal(this.app, title, placeholder, finish, value);
      const close = modal.onClose.bind(modal);
      modal.onClose = () => { close(); finish(null); };
      modal.open();
    });
  }

  private note(title: string, placeholder: string, value = ""): Promise<string | null> {
    return new Promise(resolve => new TextareaEntryModal(this.app, title, placeholder, resolve, value).open());
  }

  private timelineItemDraft(projects: readonly ProjectRef[]): Promise<TimelineItemDraftResult | null> {
    return new Promise(resolve => new TimelineItemDraftModal(
      this.app,
      projects,
      this.plugin.settings.tags,
      this.plugin.settings.itemMetadataRequirement,
      resolve
    ).open());
  }

  private choiceText(
    title: string,
    placeholder: string,
    choices: readonly ChoiceItem[],
    selected: string,
    value = ""
  ): Promise<ChoiceTextResult | null> {
    return new Promise(resolve => new ChoiceTextModal(this.app, title, placeholder, choices, selected, resolve, value).open());
  }

  private minutes(title: string): Promise<number | null> {
    return new Promise(resolve => new MinuteEntryModal(this.app, title, resolve).open());
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "btl-icon-button", attr: { "aria-label": label, title: label } });
    setIcon(button, icon);
    button.onclick = action;
    return button;
  }

  private uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

function clampScale(value: number): number { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); }
function clampProjectScale(value: number): number { return Math.max(PROJECT_SCALE_MIN, Math.min(PROJECT_SCALE_MAX, value)); }

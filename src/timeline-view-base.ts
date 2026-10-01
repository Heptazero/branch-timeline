import { ItemView, WorkspaceLeaf } from "obsidian";
import type BranchTimelinePlugin from "./main";
import {
  type ChoiceItem,
  type ChoiceTextResult,
  type TimelineItemDraftCopy,
  type TimelineItemDraftResult
} from "./modals";
import { AchievementActions } from "./pages/achievement-actions";
import { renderAchievementDetail, renderAchievementsPage } from "./pages/achievements";
import { renderHabitsPage } from "./pages/habits";
import { renderPageNavigation, type TimelinePage } from "./pages/navigation";
import { ProjectTimelineActions } from "./pages/project-actions";
import {
  PROJECT_SCALE_MAX,
  PROJECT_SCALE_MIN,
  renderProjectDetail,
  type ProjectScaleAnchor
} from "./pages/project-detail";
import { renderProjectsPage } from "./pages/projects";
import { policyPeriodAt, renderPolicyPage } from "./pages/policy";
import { PolicyActions } from "./pages/policy-actions";
import { TimelineGestures } from "./timeline/gestures";
import { RunningBar } from "./timeline/running-bar";
import { effectiveEnergyPhases } from "./timeline/energy-phases";
import { MAX_SCALE, MIN_SCALE, minuteToY } from "./timeline/model";
import { renderTimeline } from "./timeline/renderer";
import type { ProjectRef, RhythmKey, TimelineBranch, TimelineDayState, TimelineEnergyPhase } from "./types";
import { dateKey, logicalToday } from "./vault/format";
import { defaultDay } from "./vault/state-store";

export const BRANCH_TIMELINE_VIEW = "branch-timeline-hz-view";
export const BRANCH_COLORS = ["#3b6ea5", "#a5573b", "#7a3ba5", "#2e8b74", "#a53b6e"];

interface ScrollAnchor { minute: number; offset: number }

export abstract class BranchTimelineViewBase extends ItemView {
  protected date = logicalToday();
  protected scale = clampScale(Number(localStorage.getItem("branch-timeline-hz-scale")) || 1.4);
  protected gestures: TimelineGestures | null = null;
  protected scroller: HTMLElement | null = null;
  protected day: TimelineDayState | null = null;
  protected energyPhases: TimelineEnergyPhase[] = [];
  protected renderId = 0;
  protected page: TimelinePage = "day";
  protected pendingScale: number | null = null;
  protected pendingScaleAnchor: ScrollAnchor | null = null;
  protected scaleButtonTimer: number | null = null;
  protected viewResizeTimer: number | null = null;
  protected clockTimer: number | null = null;
  protected followsToday = true;
  protected selectedProjectPath: string | null = null;
  protected selectedAchievementId: string | null = null;
  protected projectScale = clampProjectScale(Number(localStorage.getItem("branch-timeline-hz-project-scale")) || 120);
  protected projectAnchor: ProjectScaleAnchor | undefined;
  protected getProjectAnchor: (() => ProjectScaleAnchor) | null = null;
  protected destroyProjectDetail: (() => void) | null = null;
  protected projectActions: ProjectTimelineActions | null = null;
  protected countdownButton: HTMLButtonElement | null = null;
  protected runningBar: RunningBar | null = null;
  protected achievementActions: AchievementActions;
  protected policyActions: PolicyActions;
  protected policySideId = localStorage.getItem("branch-timeline-hz-policy-side") || "policy-side-routine";
  protected policyPeriod = policyPeriodAt(new Date());

  constructor(leaf: WorkspaceLeaf, protected plugin: BranchTimelinePlugin) {
    super(leaf);
    const shared = {
      app: this.app,
      plugin: this.plugin,
      getDate: () => this.date,
      refresh: () => this.render(false),
      text: (title: string, placeholder: string, value?: string) => this.text(title, placeholder, value)
    };
    this.achievementActions = new AchievementActions({
      ...shared,
      colors: BRANCH_COLORS,
      onDeleteAchievement: id => { if (this.selectedAchievementId === id) this.selectedAchievementId = null; }
    });
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
      this.updateRunningBar();
      this.updateTimelineClock();
      void this.plugin.refreshTimerStatus();
    }, 60_000);
  }
  async onClose(): Promise<void> {
    this.gestures?.destroy();
    this.destroyProjectDetail?.();
    if (this.clockTimer != null) window.clearInterval(this.clockTimer);
    if (this.scaleButtonTimer != null) window.clearTimeout(this.scaleButtonTimer);
    if (this.viewResizeTimer != null) window.clearTimeout(this.viewResizeTimer);
  }
  onResize(): void {
    if (this.viewResizeTimer != null) window.clearTimeout(this.viewResizeTimer);
    this.viewResizeTimer = window.setTimeout(() => {
      this.viewResizeTimer = null;
      void this.render(true);
    }, 90);
  }
  async refresh(): Promise<void> { await this.render(true); }

  async focusRunningItem(itemId: string): Promise<void> {
    this.date = logicalToday();
    this.followsToday = true;
    this.page = "day";
    this.selectedProjectPath = null;
    this.selectedAchievementId = null;
    await this.render(false);
    window.requestAnimationFrame(() => {
      this.scroller?.querySelector<HTMLElement>(`.btl-canvas-item[data-item-id="${CSS.escape(itemId)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  protected async render(preserveScroll: boolean, anchor?: ScrollAnchor): Promise<void> {
    const requestId = ++this.renderId;
    const previousScroll = preserveScroll ? this.scroller?.scrollTop || 0 : 0;
    this.gestures?.destroy();
    this.gestures = null;
    this.destroyProjectDetail?.();
    this.destroyProjectDetail = null;
    this.getProjectAnchor = null;
    this.projectActions = null;
    this.countdownButton = null;
    this.runningBar = null;
    if (!this.plugin.settings.visiblePages.includes(this.page)) {
      this.page = "day";
      this.selectedProjectPath = null;
      this.selectedAchievementId = null;
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
      if (page !== "achievements") this.selectedAchievementId = null;
      void this.render(false);
    }, this.plugin.settings.visiblePages);
    this.countdownButton = navigationRow.createEl("button", { cls: "btl-day-countdown", attr: { "aria-label": "设置节律" } });
    this.countdownButton.createSpan();
    this.countdownButton.createEl("strong");
    this.countdownButton.onclick = () => this.openRhythmSettings(this.countdownButton!);
    this.updateCountdown();

    const runningHost = root.createDiv({ cls: "btl-running-bar is-hidden" });

    const pageContent = root.createDiv({ cls: "btl-page-content" });

    const state = await this.plugin.store.load();
    if (requestId !== this.renderId) return;
    const key = dateKey(this.date);
    const day = state.days[key] || defaultDay(this.plugin.settings.rhythm);
    this.day = day;
    this.energyPhases = effectiveEnergyPhases(state.days, key);
    this.runningBar = new RunningBar(runningHost, {
      open: itemId => void this.focusRunningItem(itemId),
      stop: itemId => void this.stopRunningItem(itemId)
    });
    this.updateRunningBar();

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
        const achievement = this.selectedAchievementId
          ? state.achievements.find(candidate => candidate.id === this.selectedAchievementId)
          : undefined;
        if (achievement) {
          renderAchievementDetail({
            container: pageContent,
            achievement,
            onBack: () => { this.selectedAchievementId = null; void this.render(false); },
            onEditRecord: record => this.achievementActions.editRecord(achievement, record),
            onRecordMenu: (record, event) => this.achievementActions.openRecordMenu(achievement, record, event),
            onMenu: event => this.achievementActions.openMenu(achievement, event)
          });
        } else {
          this.selectedAchievementId = null;
          renderAchievementsPage({
            container: pageContent,
            achievements: state.achievements,
            onOpen: target => { this.selectedAchievementId = target.id; void this.render(false); },
            onMenu: (target, event) => this.achievementActions.openMenu(target, event)
          });
        }
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
          onSettleNode: (node, card, event) => void this.policyActions.openSettlementMenu(node, card, event),
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
    const gapHorizon = this.gapHorizon(day);
    const rendered = renderTimeline(scroller, {
      day,
      tags: this.plugin.settings.tags,
      scale: this.scale,
      width,
      nowMinute,
      gapHorizon,
      rhythmLabels: this.plugin.settings.rhythmLabels,
      energyPhases: this.energyPhases
    });
    this.gestures = new TimelineGestures(scroller, rendered.canvas, day, rendered.layout, this.energyPhases, {
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
      onEnergyPhaseMove: (phaseId, minute) => void this.moveEnergyPhase(phaseId, minute),
      onEnergyPhaseColor: (phaseId, anchor) => this.openEnergyPhaseColor(phaseId, anchor),
      onEnergyPhaseMenu: (phaseId, event) => this.openEnergyPhaseMenu(phaseId, event),
      onGapBackfill: (startMinute, endMinute) => void this.backfillGap(startMinute, endMinute),
      onAddTodo: (minute, branchId) => void this.addTimelineTodo(minute, branchId),
      onAddEnergyPhase: (minute, side) => void this.addEnergyPhase(minute, side),
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

  protected abstract moveItem(itemId: string, startMin: number, branchId: string | null): Promise<void>;
  protected abstract resizeItem(itemId: string, edge: "start" | "end", minute: number): Promise<void>;
  protected abstract completeItem(itemId: string): Promise<void>;
  protected abstract stopTiming(itemId: string): Promise<void>;
  protected abstract stopRunningItem(itemId: string): Promise<void>;
  protected abstract editItemNote(itemId: string): Promise<void>;
  protected abstract openItemMenu(itemId: string, event: MouseEvent): void;
  protected abstract openBranchMenu(branchId: string, event: MouseEvent): void;
  protected abstract updateBranch(branchId: string, mutate: (branch: TimelineBranch) => void): Promise<void>;
  protected abstract updateRhythm(key: RhythmKey, minute: number, moved: boolean): Promise<void>;
  protected abstract moveEnergyPhase(phaseId: string, minute: number): Promise<void>;
  protected abstract openEnergyPhaseColor(phaseId: string, anchor: HTMLElement): void;
  protected abstract openEnergyPhaseMenu(phaseId: string, event: MouseEvent): void;
  protected abstract backfillGap(startMinute: number, endMinute: number): Promise<void>;
  protected abstract addTimelineTodo(minute: number, branchId: string | null): Promise<void>;
  protected abstract addEnergyPhase(minute: number, side: -1 | 1): Promise<void>;
  protected abstract addTimelineBranch(minute: number): Promise<void>;
  protected abstract previewScale(next: number, anchorClientY: number, commit: boolean): Promise<void>;
  protected abstract addProject(): Promise<void>;
  protected abstract addHabit(): Promise<void>;
  protected abstract openAddMenu(event: MouseEvent): void;
  protected abstract shiftDate(amount: number): void;
  protected abstract dateTitle(): string;
  protected abstract openDatePicker(anchor: HTMLElement): Promise<void>;
  protected abstract nowOnAxis(day: TimelineDayState): number | undefined;
  protected abstract currentLogicalMinute(): number | undefined;
  protected abstract gapHorizon(day: TimelineDayState): number | undefined;
  protected abstract updateCountdown(): void;
  protected abstract updateTimelineClock(): void;
  protected updateRunningBar(): void {
    if (!this.runningBar || !this.day) return;
    if (dateKey(this.date) !== dateKey(logicalToday())) {
      this.runningBar.hide();
      return;
    }
    this.runningBar.update(this.day, this.nowOnAxis(this.day) ?? this.day.wake);
  }
  protected abstract stepScale(factor: number): void;
  protected abstract toggleProjectPin(path: string): Promise<void>;
  protected abstract openProjectFile(path: string): Promise<void>;
  protected abstract toggleProjectGroup(label: string): Promise<void>;
  protected abstract reorderProjects(paths: string[]): Promise<void>;
  protected abstract reorderHabits(names: string[]): Promise<void>;
  protected abstract reorderHabitCards(ids: string[]): Promise<void>;
  protected abstract openPluginSettings(): void;
  protected abstract openPolicySideMenu(side: import("./types").PolicySide, event: MouseEvent): void;
  protected abstract setPolicySceneWidth(sideId: string, width: number): Promise<void>;
  protected abstract openRhythmSettings(anchor: HTMLElement): void;
  protected abstract text(title: string, placeholder: string, value?: string): Promise<string | null>;
  protected abstract note(title: string, placeholder: string, value?: string): Promise<string | null>;
  protected abstract timelineItemDraft(projects: readonly ProjectRef[], copy?: TimelineItemDraftCopy): Promise<TimelineItemDraftResult | null>;
  protected abstract choiceText(title: string, placeholder: string, choices: readonly ChoiceItem[], selected: string, value?: string): Promise<ChoiceTextResult | null>;
  protected abstract minutes(title: string): Promise<number | null>;
  protected abstract iconButton(parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void): HTMLButtonElement;
  protected abstract uid(prefix: string): string;
}

function clampScale(value: number): number { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); }
function clampProjectScale(value: number): number { return Math.max(PROJECT_SCALE_MIN, Math.min(PROJECT_SCALE_MAX, value)); }

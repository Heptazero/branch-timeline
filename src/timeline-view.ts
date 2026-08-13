import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { ConfirmModal, TextEntryModal } from "./modals";
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
import { TimelineGestures } from "./timeline/gestures";
import { MAX_SCALE, MIN_SCALE, TIMELINE_TOP, clampMinute, minuteToY } from "./timeline/model";
import { showBranchMenu, showItemMenu } from "./timeline/menu";
import { applyTimelineLod, renderTimeline } from "./timeline/renderer";
import type { TimelineBranch, TimelineDayState, TimelineItem } from "./types";
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
  private selectedProjectPath: string | null = null;
  private projectScale = clampProjectScale(Number(localStorage.getItem("branch-timeline-hz-project-scale")) || 120);
  private projectAnchor: ProjectScaleAnchor | undefined;
  private getProjectAnchor: (() => ProjectScaleAnchor) | null = null;
  private destroyProjectDetail: (() => void) | null = null;
  private projectActions: ProjectTimelineActions | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: BranchTimelinePlugin) { super(leaf); }
  getViewType(): string { return BRANCH_TIMELINE_VIEW; }
  getDisplayText(): string { return "Branch Timeline"; }
  getIcon(): string { return "git-branch"; }
  async onOpen(): Promise<void> {
    await this.render(false);
    this.clockTimer = window.setInterval(() => {
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

    const root = this.contentEl;
    root.empty();
    root.addClass("branch-timeline-hz");
    const toolbar = root.createDiv({ cls: "btl-toolbar" });
    const dateNav = toolbar.createDiv({ cls: "btl-date-nav" });
    this.iconButton(dateNav, "chevron-left", "前一天", () => this.shiftDate(-1));
    const dateButton = dateNav.createEl("button", { cls: "btl-date-button", text: this.dateTitle() });
    dateButton.onclick = () => { this.date = logicalToday(); void this.render(false); };
    this.iconButton(dateNav, "chevron-right", "后一天", () => this.shiftDate(1));
    const add = this.iconButton(toolbar, "plus", "添加", event => this.openAddMenu(event));
    add.addClass("btl-add-button");

    renderPageNavigation(root, this.page, page => {
      this.page = page;
      if (page !== "projects") this.selectedProjectPath = null;
      void this.render(false);
    });

    const pageContent = root.createDiv({ cls: "btl-page-content" });

    const state = await this.plugin.store.load();
    if (requestId !== this.renderId) return;
    const key = dateKey(this.date);
    const day = state.days[key] || defaultDay(this.plugin.settings.dayStartMinute, this.plugin.settings.dayEndMinute);
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
            text: (title, placeholder, value) => this.text(title, placeholder, value)
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
          renderProjectsPage(pageContent, projects, path => {
            this.selectedProjectPath = path;
            this.projectAnchor = undefined;
            void this.render(false);
          });
        }
      } else if (this.page === "habits") {
        await renderHabitsPage({
          container: pageContent,
          date: this.date,
          habits: this.plugin.settings.habits,
          readDay: date => this.plugin.repository.readDiaryDay(date),
          setHabit: (date, habit, done) => this.plugin.repository.setHabit(date, habit, done),
          isCurrent: () => requestId === this.renderId,
          refresh: () => this.render(false)
        });
      }
      else this.renderSimplePage(pageContent, this.page);
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
      nowMinute
    });
    this.gestures = new TimelineGestures(scroller, rendered.canvas, day, rendered.layout, {
      onItemMove: (itemId, startMin, branchId) => void this.moveItem(itemId, startMin, branchId),
      onItemResize: (itemId, edge, minute) => void this.resizeItem(itemId, edge, minute),
      onItemComplete: itemId => void this.completeItem(itemId),
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
        const focusMinute = nowMinute ?? day.pivot;
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
      const end = this.nowOnAxis(day) ?? target.plannedMin ?? day.pivot;
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
      const now = this.nowOnAxis(day) ?? target.plannedMin ?? target.endMin ?? day.pivot;
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

  private openItemMenu(itemId: string, event: PointerEvent): void {
    const item = this.day?.items.find(candidate => candidate.id === itemId);
    if (!item) return;
    showItemMenu(event, item, this.plugin.settings.tags, {
      complete: () => void this.completeItem(item.id),
      startTiming: () => void this.startTiming(item.id),
      stopTiming: () => void this.stopTiming(item.id),
      cancelTiming: () => void this.cancelTiming(item.id),
      ...(item.projectPath ? { toggleMilestone: () => void this.updateDay(day => {
        const target = day.items.find(candidate => candidate.id === item.id);
        if (target) target.milestone = !target.milestone;
      }) } : {}),
      rename: () => void this.renameItem(item),
      setTag: tagId => void this.setItemTag(item.id, tagId),
      remove: () => this.confirmRemoveItem(item)
    });
  }

  private openBranchMenu(branchId: string, event: PointerEvent): void {
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

  private async renameItem(item: TimelineItem): Promise<void> {
    const value = await this.text("重命名", "标题", item.title);
    if (value == null) return;
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === item.id);
      if (target) target.title = value;
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

  private async updateRhythm(key: "wake" | "pivot" | "sleep", minute: number, moved: boolean): Promise<void> {
    await this.updateDay(day => {
      const realKey = `${key}Real` as "wakeReal" | "pivotReal" | "sleepReal";
      if (moved) {
        day[key] = minute;
        day[realKey] = true;
      } else if (day[realKey]) {
        day[realKey] = false;
      } else {
        const now = this.nowOnAxis(day);
        if (now != null) day[key] = rhythmClamp(day, key, now);
        day[realKey] = true;
      }
    });
  }

  private async addTimelineTodo(minute: number, branchId: string | null): Promise<void> {
    const title = await this.text("添加代办", "代办内容");
    if (!title) return;
    await this.updateDay(day => {
      day.items.push({ id: this.uid("todo"), title, kind: "todo", plannedMin: minute, branchId });
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
      const day = state.days[key] ||= defaultDay(this.plugin.settings.dayStartMinute, this.plugin.settings.dayEndMinute);
      mutator(day);
    });
    await this.render(true);
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

  private renderSimplePage(container: HTMLElement, page: "achievements" | "policy"): void {
    container.createDiv({ cls: "btl-empty", text: page === "achievements" ? "暂无成就" : "暂无锚点" });
  }

  private openAddMenu(event: MouseEvent): void {
    const menu = new Menu();
    const minute = this.day ? this.nowOnAxis(this.day) ?? this.day.pivot : 12 * 60;
    if (this.page === "projects") {
      if (this.selectedProjectPath && this.projectActions) {
        const at = absoluteMinute(dateKey(this.date), minute);
        menu.addItem(item => item.setTitle("添加代办").setIcon("circle-plus").onClick(() => void this.projectActions?.addTodo(at, null)));
        menu.addItem(item => item.setTitle("添加分支").setIcon("git-branch-plus").onClick(() => void this.projectActions?.addBranch(at, 1)));
        menu.showAtMouseEvent(event);
        return;
      }
      menu.addItem(item => item.setTitle("添加项目待办").setIcon("list-plus").onClick(() => void this.plugin.addProjectTask(this.date)));
      menu.addItem(item => item.setTitle("记录项目工时").setIcon("timer").onClick(() => void this.plugin.recordProjectWork(this.date)));
      menu.showAtMouseEvent(event);
      return;
    }
    if (this.page === "habits") {
      menu.addItem(item => item.setTitle("打卡习惯").setIcon("check-circle").onClick(() => void this.plugin.toggleHabit(this.date)));
      menu.showAtMouseEvent(event);
      return;
    }
    if (this.page !== "day") {
      new Notice(this.page === "policy" ? "请在锚点页双击添加" : "请在成就页添加");
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
    this.date = shiftPageDate(this.date, this.page, amount);
    void this.render(false);
  }

  private dateTitle(): string {
    return pageDateTitle(this.date, this.page);
  }

  private nowOnAxis(day: TimelineDayState): number | undefined {
    if (dateKey(this.date) !== dateKey(logicalToday())) return undefined;
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
    return minute >= day.wake && minute <= day.sleep ? minute : undefined;
  }

  private viewportCenterY(): number {
    const rect = this.scroller?.getBoundingClientRect();
    return rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
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

function rhythmClamp(day: TimelineDayState, key: "wake" | "pivot" | "sleep", minute: number): number {
  if (key === "wake") return Math.max(0, Math.min(day.pivot - 30, minute));
  if (key === "pivot") return Math.max(day.wake + 30, Math.min(day.sleep - 30, minute));
  return Math.max(day.pivot + 30, Math.min(28 * 60, minute));
}

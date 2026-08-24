import { App, Menu, Notice } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { ConfirmModal, MinuteEntryModal } from "../modals";
import { backfillItem as applyBackfill } from "../timeline/model";
import { showItemMenu } from "../timeline/menu";
import type { ProjectTimelineBranch, TimelineDayState, TimelineItem } from "../types";
import { dateKey, logicalToday } from "../vault/format";
import { defaultDay } from "../vault/state-store";
import { absoluteMinute, splitAbsoluteMinute, type ProjectTimelineEntry } from "./project-model";
import type { ProjectScaleAnchor } from "./project-detail";

const PROJECT_BRANCH_COLORS = ["#3b6ea5", "#a5573b", "#7a3ba5", "#2e8b74", "#a53b6e"];

export interface ProjectActionsOptions {
  app: App;
  plugin: BranchTimelinePlugin;
  projectPath: string;
  getAnchor: () => ProjectScaleAnchor | undefined;
  setAnchor: (anchor: ProjectScaleAnchor | undefined) => void;
  refresh: () => Promise<void>;
  text: (title: string, placeholder: string, value?: string) => Promise<string | null>;
  note: (title: string, placeholder: string, value?: string) => Promise<string | null>;
}

export class ProjectTimelineActions {
  constructor(private options: ProjectActionsOptions) {}

  async moveItem(date: string, itemId: string, branchId: string | null): Promise<void> {
    this.preserveAnchor();
    await this.options.plugin.store.update(state => {
      const item = state.days[date]?.items.find(candidate => candidate.id === itemId);
      if (!item) return;
      item.projectBranchId = branchId;
      if (!branchId) return;
      const branch = state.projects[this.options.projectPath]?.branches.find(candidate => candidate.id === branchId);
      if (!branch) return;
      const at = this.itemAbsoluteMinute(date, item);
      branch.startAbs = Math.min(branch.startAbs, at);
      branch.endAbs = Math.max(branch.endAbs, at);
    });
    await this.options.refresh();
  }

  async updateBranch(branchId: string, mutate: (branch: ProjectTimelineBranch) => void): Promise<void> {
    this.preserveAnchor();
    await this.options.plugin.store.update(state => {
      const branch = state.projects[this.options.projectPath]?.branches.find(candidate => candidate.id === branchId);
      if (branch) mutate(branch);
    });
    await this.options.refresh();
  }

  async addTodo(abs: number, branchId: string | null): Promise<void> {
    const title = await this.options.text("添加代办", "代办内容");
    if (!title) return;
    const { date, minute } = splitAbsoluteMinute(abs);
    const id = this.uid("btl");
    try {
      await this.options.plugin.repository.addProjectTask(this.options.projectPath, title, id);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "项目待办写入失败");
      return;
    }
    this.preserveAnchor();
    await this.options.plugin.store.update(state => {
      const day = state.days[date] ||= defaultDay(this.options.plugin.settings.rhythm);
      day.items.push({
        id,
        title,
        kind: "todo",
        plannedMin: minute,
        projectPath: this.options.projectPath,
        projectTaskId: id,
        projectBranchId: branchId
      });
      if (!branchId) return;
      const branch = state.projects[this.options.projectPath]?.branches.find(candidate => candidate.id === branchId);
      if (!branch) return;
      branch.startAbs = Math.min(branch.startAbs, abs);
      branch.endAbs = Math.max(branch.endAbs, abs);
    });
    await this.options.refresh();
  }

  async addBranch(abs: number, side: -1 | 1): Promise<void> {
    const name = await this.options.text("添加分支", "分支名称");
    if (!name) return;
    this.preserveAnchor();
    await this.options.plugin.store.update(state => {
      const timeline = state.projects[this.options.projectPath] ||= { branches: [] };
      timeline.branches.push({
        id: this.uid("pbranch"),
        name,
        startAbs: abs,
        endAbs: abs + 1440,
        side,
        color: PROJECT_BRANCH_COLORS[timeline.branches.length % PROJECT_BRANCH_COLORS.length],
        offsetX: 0,
        merged: false
      });
    });
    await this.options.refresh();
  }

  async editNote(date: string, item: TimelineItem): Promise<void> {
    const note = await this.options.note("备注", "写点什么", item.note || "");
    if (note == null) return;
    try {
      const state = await this.options.plugin.store.load();
      const day = state.days[date];
      const minute = item.startMin ?? item.startedMin ?? item.plannedMin ?? item.endMin ?? day?.wake ?? 0;
      await this.options.plugin.repository.syncProjectNote(this.options.projectPath, date, minute, item.note || "", note);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "项目备注同步失败");
      return;
    }
    await this.updateItem(date, item.id, target => { target.note = note.trim() || undefined; });
  }

  openItemMenu(entry: ProjectTimelineEntry, event: MouseEvent): void {
    const { date, item } = entry;
    showItemMenu(event, item, this.options.plugin.settings.tags, this.options.plugin.repository.listProjects(), {
      complete: () => void this.completeItem(date, item.id),
      startTiming: () => void this.startItemTiming(date, item.id),
      stopTiming: () => void this.stopItemTiming(date, item.id),
      cancelTiming: () => void this.cancelItemTiming(date, item.id),
      backfill: () => void this.backfillItem(date, item.id),
      toggleMilestone: () => void this.updateItem(date, item.id, target => { target.milestone = !target.milestone; }),
      rename: () => void this.renameItem(date, item),
      setProject: projectPath => void this.setItemProject(date, item.id, projectPath),
      setTag: tagId => void this.setItemTag(date, item.id, tagId),
      remove: () => this.confirmRemoveItem(date, item)
    });
  }

  openBranchMenu(branch: ProjectTimelineBranch, event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.renameBranch(branch)));
    menu.addItem(item => item
      .setTitle(branch.side > 0 ? "挪到左侧" : "挪到右侧")
      .setIcon("arrow-left-right")
      .onClick(() => void this.updateBranch(branch.id, target => { target.side = target.side > 0 ? -1 : 1; })));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除分支").setIcon("trash-2").setWarning(true).onClick(() => this.confirmRemoveBranch(branch)));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  private async completeItem(date: string, itemId: string): Promise<void> {
    const state = await this.options.plugin.store.load();
    const item = state.days[date]?.items.find(candidate => candidate.id === itemId);
    if (!item || item.kind === "fact") return;
    if (item.projectTaskId) {
      try {
        await this.options.plugin.repository.setProjectTaskDone(this.options.projectPath, item.projectTaskId, true);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "项目待办更新失败");
        return;
      }
    }
    await this.updateItem(date, itemId, (target, day) => {
      const end = this.minuteForDate(date, day, target.plannedMin ?? day.napEnd);
      target.kind = "fact";
      target.startMin = target.startedMin ?? end;
      target.endMin = end;
      target.factTiming = false;
      delete target.startedMin;
    });
  }

  private async startItemTiming(date: string, itemId: string): Promise<void> {
    await this.updateItem(date, itemId, (target, day) => {
      const now = this.minuteForDate(date, day, target.plannedMin ?? target.endMin ?? day.napEnd);
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
          projectTaskId: undefined,
          milestone: false
        });
      } else {
        target.startMin = now;
        target.endMin = now;
        target.factTiming = true;
      }
    });
  }

  private async stopItemTiming(date: string, itemId: string): Promise<void> {
    await this.updateItem(date, itemId, (target, day) => {
      if (target.kind !== "fact") return;
      target.endMin = this.minuteForDate(date, day, target.endMin ?? target.startMin ?? day.napEnd);
      target.factTiming = false;
    });
  }

  private async cancelItemTiming(date: string, itemId: string): Promise<void> {
    await this.updateItem(date, itemId, target => { delete target.startedMin; });
  }

  private async backfillItem(date: string, itemId: string): Promise<void> {
    const state = await this.options.plugin.store.load();
    const item = state.days[date]?.items.find(candidate => candidate.id === itemId);
    if (!item) return;
    const minutes = await new Promise<number | null>(resolve => new MinuteEntryModal(this.options.app, `补记 · ${item.title}`, resolve).open());
    if (minutes == null) return;
    if (item.kind === "todo" && item.projectPath && item.projectTaskId) {
      try { await this.options.plugin.repository.setProjectTaskDone(item.projectPath, item.projectTaskId, true); }
      catch (error) { new Notice(error instanceof Error ? error.message : "项目待办更新失败"); return; }
    }
    await this.updateItem(date, itemId, (target, day) => {
      const end = this.minuteForDate(date, day, target.endMin ?? target.plannedMin ?? day.napEnd);
      applyBackfill(target, end, minutes, day.wake);
    });
  }

  private async renameItem(date: string, item: TimelineItem): Promise<void> {
    const title = await this.options.text("重命名", "标题", item.title);
    if (title == null) return;
    await this.updateItem(date, item.id, target => { target.title = title; });
  }

  private async setItemTag(date: string, itemId: string, tagId: string | null): Promise<void> {
    const tag = tagId ? this.options.plugin.settings.tags.find(candidate => candidate.id === tagId) : undefined;
    await this.updateItem(date, itemId, target => {
      target.tagId = tag?.id;
      target.tag = tag?.name;
    });
  }

  private async setItemProject(date: string, itemId: string, projectPath: string | null): Promise<void> {
    await this.updateItem(date, itemId, target => {
      if (target.projectPath === projectPath) return;
      target.projectPath = projectPath || undefined;
      target.projectBranchId = null;
      target.projectTaskId = undefined;
      if (!projectPath) target.milestone = false;
    });
  }

  private confirmRemoveItem(date: string, item: TimelineItem): void {
    new ConfirmModal(
      this.options.app,
      `删除“${item.title}”？`,
      item.projectTaskId ? "只从时间轴移除；项目笔记中的待办保留。" : "这条时间轴记录会被删除。",
      () => this.updateItem(date, item.id, (_target, day) => {
        day.items = day.items.filter(candidate => candidate.id !== item.id);
      })
    ).open();
  }

  private async renameBranch(branch: ProjectTimelineBranch): Promise<void> {
    const name = await this.options.text("重命名分支", "分支名称", branch.name);
    if (name == null) return;
    await this.updateBranch(branch.id, target => { target.name = name; });
  }

  private confirmRemoveBranch(branch: ProjectTimelineBranch): void {
    new ConfirmModal(this.options.app, `删除“${branch.name}”？`, "分支上的事项会回到主线，事项本身不会删除。", async () => {
      this.preserveAnchor();
      await this.options.plugin.store.update(state => {
        const timeline = state.projects[this.options.projectPath];
        if (timeline) timeline.branches = timeline.branches.filter(candidate => candidate.id !== branch.id);
        for (const day of Object.values(state.days)) {
          for (const item of day.items) {
            if (item.projectPath === this.options.projectPath && item.projectBranchId === branch.id) item.projectBranchId = null;
          }
        }
      });
      await this.options.refresh();
    }).open();
  }

  private async updateItem(
    date: string,
    itemId: string,
    mutate: (item: TimelineItem, day: TimelineDayState) => void
  ): Promise<void> {
    this.preserveAnchor();
    await this.options.plugin.store.update(state => {
      const day = state.days[date];
      const item = day?.items.find(candidate => candidate.id === itemId);
      if (day && item) mutate(item, day);
    });
    await this.options.refresh();
  }

  private preserveAnchor(): void {
    this.options.setAnchor(this.options.getAnchor());
  }

  private minuteForDate(date: string, day: TimelineDayState, fallback: number): number {
    if (date !== dateKey(logicalToday())) return fallback;
    const now = new Date();
    return Math.max(day.wake, Math.min(day.sleep, now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0)));
  }

  private itemAbsoluteMinute(date: string, item: TimelineItem): number {
    const minute = item.startMin ?? item.startedMin ?? item.endMin ?? item.plannedMin ?? 0;
    return absoluteMinute(date, minute);
  }

  private uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

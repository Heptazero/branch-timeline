import { Menu, Notice } from "obsidian";
import { openColorPopover } from "./color-popover";
import { ConfirmModal } from "./modals";
import { rhythmRealKey } from "./rhythm";
import { ENERGY_PHASE_COLORS, materializeEnergyPhases } from "./timeline/energy-phases";
import { backfillItem as applyBackfill, clampMinute } from "./timeline/model";
import { showBranchMenu, showItemMenu } from "./timeline/menu";
import { TimerService, compactDuration, elapsedMinutes } from "./timeline/timer-service";
import type { RhythmKey, TimelineBranch, TimelineDayState, TimelineEnergyPhase, TimelineItem } from "./types";
import { dateKey } from "./vault/format";
import { defaultDay } from "./vault/state-store";
import { BRANCH_COLORS, BranchTimelineViewBase } from "./timeline-view-base";

export abstract class BranchTimelineViewDayActions extends BranchTimelineViewBase {
  protected readonly timers = new TimerService();
  protected async moveItem(itemId: string, startMin: number, branchId: string | null): Promise<void> {
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

  protected async resizeItem(itemId: string, edge: "start" | "end", minute: number): Promise<void> {
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item || item.kind !== "fact") return;
      if (edge === "start") item.startMin = Math.min(minute, (item.endMin ?? minute + 5) - 5);
      else item.endMin = Math.max(minute, (item.startMin ?? minute - 5) + 5);
    });
  }

  protected async completeItem(itemId: string): Promise<void> {
    const item = this.day?.items.find(candidate => candidate.id === itemId);
    if (!item || item.kind === "fact") return;
    if (item.projectPath && item.projectTaskId) {
      try { await this.plugin.repository.setProjectTaskDone(item.projectPath, item.projectTaskId, true); }
      catch (error) { new Notice(error instanceof Error ? error.message : "项目待办更新失败"); return; }
    }
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      const end = this.nowOnAxis(day) ?? target?.plannedMin ?? day.napEnd;
      this.timers.complete(day, itemId, end);
    });
    new Notice(`完成 · ${item.title}`);
  }

  protected async startTiming(itemId: string): Promise<void> {
    const title = this.day?.items.find(candidate => candidate.id === itemId)?.title;
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (!target) return;
      const now = this.nowOnAxis(day) ?? target.plannedMin ?? target.endMin ?? day.napEnd;
      this.timers.start(day, itemId, now, () => this.uid("fact"));
    });
    if (title) new Notice(`开始计时 · ${title}`);
  }

  protected async stopTiming(itemId: string): Promise<void> {
    let summary = "";
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === itemId);
      if (!target) return;
      const running = target.factTiming || (target.kind === "todo" && target.startedMin != null);
      if (!running) return;
      const now = this.nowOnAxis(day) ?? target.endMin ?? target.startedMin ?? target.startMin ?? day.wake;
      summary = `${target.title} · ${compactDuration(elapsedMinutes(target, day, now))}`;
      if (target.kind === "todo") this.timers.stopTodo(day, itemId, now, () => this.uid("fact"));
      else this.timers.stop(day, itemId, now);
    });
    if (summary) new Notice(`计时结束 · ${summary}`);
  }

  protected async cancelTiming(itemId: string): Promise<void> {
    await this.updateDay(day => {
      this.timers.cancel(day, itemId);
    });
  }

  protected async stopRunningItem(itemId: string): Promise<void> {
    await this.stopTiming(itemId);
  }

  protected openItemMenu(itemId: string, event: MouseEvent): void {
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

  protected openBranchMenu(branchId: string, event: MouseEvent): void {
    const branch = this.day?.branches.find(candidate => candidate.id === branchId);
    if (!branch) return;
    showBranchMenu(event, branch, {
      rename: () => void this.renameBranch(branch),
      flip: () => void this.updateBranch(branch.id, target => { target.side = target.side > 0 ? -1 : 1; }),
      remove: () => this.confirmRemoveBranch(branch)
    });
  }

  protected async setItemTag(itemId: string, tagId: string | null): Promise<void> {
    const tag = tagId ? this.plugin.settings.tags.find(candidate => candidate.id === tagId) : undefined;
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item) return;
      item.tagId = tag?.id;
      item.tag = tag?.name;
    });
  }

  protected async setItemProject(itemId: string, projectPath: string | null): Promise<void> {
    await this.updateDay(day => {
      const item = day.items.find(candidate => candidate.id === itemId);
      if (!item || item.projectPath === projectPath) return;
      item.projectPath = projectPath || undefined;
      item.projectBranchId = null;
      item.projectTaskId = undefined;
      if (!projectPath) item.milestone = false;
    });
  }

  protected async backfillItem(itemId: string): Promise<void> {
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

  protected async backfillGap(startMinute: number, endMinute: number): Promise<void> {
    const minutes = Math.max(1, Math.round(endMinute - startMinute));
    const projects = this.plugin.repository.listProjects().filter(project =>
      ["active", "doing", "进行中"].includes(project.status.trim().toLowerCase())
    );
    const draft = await this.timelineItemDraft(projects, {
      heading: `补记 ${gapDurationText(minutes)}`,
      titlePlaceholder: "做了什么",
      submitLabel: "补记"
    });
    if (!draft) return;
    const tag = draft.tagId ? this.plugin.settings.tags.find(candidate => candidate.id === draft.tagId) : undefined;
    if (draft.projectPath) {
      try {
        await this.plugin.repository.addProjectLog(
          draft.projectPath,
          this.date,
          endMinute,
          minutes,
          draft.note || draft.title
        );
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "项目补记写入失败");
        return;
      }
    }
    await this.updateDay(day => {
      day.items.push({
        id: this.uid("fact"),
        title: draft.title,
        kind: "fact",
        startMin: startMinute,
        endMin: endMinute,
        projectPath: draft.projectPath || undefined,
        tagId: tag?.id,
        tag: tag?.name,
        note: draft.note || undefined
      });
    });
  }

  protected async renameItem(item: TimelineItem): Promise<void> {
    const value = await this.text("重命名", "标题", item.title);
    if (value == null) return;
    await this.updateDay(day => {
      const target = day.items.find(candidate => candidate.id === item.id);
      if (target) target.title = value;
    });
  }

  protected async editItemNote(itemId: string): Promise<void> {
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

  protected async renameBranch(branch: TimelineBranch): Promise<void> {
    const value = await this.text("重命名分支", "分支名称", branch.name);
    if (value == null) return;
    await this.updateBranch(branch.id, target => { target.name = value; });
  }

  protected confirmRemoveItem(item: TimelineItem): void {
    new ConfirmModal(
      this.app,
      `删除“${item.title}”？`,
      item.projectTaskId ? "只从时间轴移除；项目笔记中的待办保留。" : "这条时间轴记录会被删除。",
      () => this.updateDay(day => { day.items = day.items.filter(candidate => candidate.id !== item.id); })
    ).open();
  }

  protected confirmRemoveBranch(branch: TimelineBranch): void {
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

  protected async updateBranch(branchId: string, mutate: (branch: TimelineBranch) => void): Promise<void> {
    await this.updateDay(day => {
      const branch = day.branches.find(candidate => candidate.id === branchId);
      if (branch) mutate(branch);
    });
  }

  protected async updateRhythm(key: RhythmKey, minute: number, moved: boolean): Promise<void> {
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

  protected async updateRhythmMarker(id: string, minute: number, moved: boolean): Promise<void> {
    const definition = this.plugin.settings.rhythmMarkers.find(marker => marker.id === id);
    if (!definition) return;
    await this.updateDay(day => {
      const markers = day.rhythmMarkers ||= [];
      let marker = markers.find(candidate => candidate.id === id);
      if (!marker) {
        marker = { id, minute: definition.minute, real: false };
        markers.push(marker);
      }
      if (moved) {
        marker.minute = minute;
        marker.real = true;
      } else if (marker.real) {
        marker.real = false;
      } else {
        marker.minute = this.currentLogicalMinute() ?? marker.minute;
        marker.real = true;
      }
    });
  }

  protected async addTimelineTodo(minute: number, branchId: string | null): Promise<void> {
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

  protected async addTimelineBranch(minute: number): Promise<void> {
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

  protected async addEnergyPhase(minute: number, side: -1 | 1): Promise<void> {
    if (this.energyPhases.some(phase => Math.abs(phase.at - minute) < 5)) {
      new Notice("这里已有精力分界");
      return;
    }
    const result = await this.choiceText(
      "添加精力区间",
      "区间名称",
      ENERGY_PHASE_COLORS.map(choice => ({ ...choice, color: choice.id })),
      ENERGY_PHASE_COLORS[0].id
    );
    if (!result) return;
    await this.updateEnergyPhases(phases => {
      phases.push({
        id: this.uid("energy"),
        name: result.text,
        at: clampMinute(this.day || defaultDay(this.plugin.settings.rhythm), minute),
        color: result.choice || ENERGY_PHASE_COLORS[0].id,
        side
      });
    });
  }

  protected async moveEnergyPhase(phaseId: string, minute: number): Promise<void> {
    await this.updateEnergyPhases(phases => {
      const phase = phases.find(candidate => candidate.id === phaseId);
      if (phase) phase.at = minute;
    });
  }

  protected openEnergyPhaseColor(phaseId: string, anchor: HTMLElement): void {
    const phase = this.energyPhases.find(candidate => candidate.id === phaseId);
    if (!phase) return;
    openColorPopover(
      anchor,
      ENERGY_PHASE_COLORS.map(choice => ({ ...choice, color: choice.id })),
      phase.color,
      color => this.updateEnergyPhases(phases => {
        const target = phases.find(candidate => candidate.id === phaseId);
        if (target) target.color = color;
      })
    );
  }

  protected openEnergyPhaseMenu(phaseId: string, event: MouseEvent): void {
    const phase = this.energyPhases.find(candidate => candidate.id === phaseId);
    if (!phase) return;
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.renameEnergyPhase(phase)));
    menu.addItem(item => item.setTitle(phase.side < 0 ? "移到右侧" : "移到左侧").setIcon("arrow-left-right").onClick(() => void this.updateEnergyPhases(phases => {
      const target = phases.find(candidate => candidate.id === phase.id);
      if (target) target.side = target.side < 0 ? 1 : -1;
    })));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除区间").setIcon("trash-2").setWarning(true).onClick(() => this.confirmRemoveEnergyPhase(phase)));
    menu.showAtMouseEvent(event);
  }

  protected async renameEnergyPhase(phase: TimelineEnergyPhase): Promise<void> {
    const value = await this.text("重命名精力区间", "区间名称", phase.name);
    if (value == null) return;
    await this.updateEnergyPhases(phases => {
      const target = phases.find(candidate => candidate.id === phase.id);
      if (target) target.name = value;
    });
  }

  protected confirmRemoveEnergyPhase(phase: TimelineEnergyPhase): void {
    new ConfirmModal(
      this.app,
      `删除“${phase.name}”？`,
      "只改变当天及以后的精力区间，之前日期不变。",
      () => this.updateEnergyPhases(phases => {
        const index = phases.findIndex(candidate => candidate.id === phase.id);
        if (index >= 0) phases.splice(index, 1);
      })
    ).open();
  }

  protected async updateEnergyPhases(mutator: (phases: TimelineEnergyPhase[]) => void): Promise<void> {
    const key = dateKey(this.date);
    await this.plugin.store.update(state => {
      const day = state.days[key] ||= defaultDay(this.plugin.settings.rhythm);
      const phases = materializeEnergyPhases(state.days, key, day);
      mutator(phases);
      phases.sort((a, b) => a.at - b.at);
    });
    await this.render(true);
  }

  protected async updateDay(mutator: (day: TimelineDayState) => void): Promise<void> {
    const key = dateKey(this.date);
    await this.plugin.store.update(state => {
      const day = state.days[key] ||= defaultDay(this.plugin.settings.rhythm);
      mutator(day);
    });
    await this.plugin.refreshTimerStatus();
    await this.render(true);
  }
}

function gapDurationText(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}小时${rest ? `${rest}分钟` : ""}`;
}

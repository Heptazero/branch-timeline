import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import type BranchTimelinePlugin from "./main";
import type { TimelineItem } from "./types";
import { dateKey } from "./vault/format";
import { defaultDay } from "./vault/state-store";

export const BRANCH_TIMELINE_VIEW = "branch-timeline-hz-view";

function timeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export class BranchTimelineView extends ItemView {
  private date = new Date();
  constructor(leaf: WorkspaceLeaf, private plugin: BranchTimelinePlugin) { super(leaf); }
  getViewType(): string { return BRANCH_TIMELINE_VIEW; }
  getDisplayText(): string { return "分支时间线"; }
  getIcon(): string { return "git-branch"; }
  async onOpen(): Promise<void> { await this.render(); }
  async refresh(): Promise<void> { await this.render(); }

  private async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("branch-timeline-hz");
    const toolbar = root.createDiv({ cls: "btl-toolbar" });
    const dateNav = toolbar.createDiv({ cls: "btl-date-nav" });
    this.iconButton(dateNav, "chevron-left", "前一天", () => this.shiftDate(-1));
    const dateButton = dateNav.createEl("button", { cls: "btl-date-button", text: this.dateTitle() });
    dateButton.onclick = () => { this.date = new Date(); void this.render(); };
    this.iconButton(dateNav, "chevron-right", "后一天", () => this.shiftDate(1));
    const add = this.iconButton(toolbar, "plus", "添加", event => this.openAddMenu(event));
    add.addClass("btl-add-button");

    const [state, diary] = await Promise.all([this.plugin.store.load(), this.plugin.repository.readDiaryDay(this.date)]);
    const day = state.days[dateKey(this.date)] || defaultDay(this.plugin.settings.dayStartMinute, this.plugin.settings.dayEndMinute);
    const habitStrip = root.createDiv({ cls: "btl-habit-strip" });
    for (const habit of this.plugin.settings.habits) {
      const chip = habitStrip.createEl("button", { text: habit, cls: diary.habits[habit] ? "is-done" : "" });
      chip.onclick = async () => {
        await this.plugin.repository.setHabit(this.date, habit, !diary.habits[habit]);
        await this.render();
      };
    }

    const timeline = root.createDiv({ cls: "btl-timeline" });
    const span = Math.max(60, day.sleep - day.wake);
    timeline.style.setProperty("--btl-span", String(span));
    const axis = timeline.createDiv({ cls: "btl-axis" });
    for (let minute = Math.ceil(day.wake / 60) * 60; minute <= day.sleep; minute += 60) {
      const tick = axis.createDiv({ cls: "btl-tick" });
      tick.style.top = `${((minute - day.wake) / span) * 100}%`;
      tick.createSpan({ text: timeLabel(minute) });
    }
    for (const item of day.items) this.renderItem(timeline, item, day.wake, span);
  }

  private renderItem(timeline: HTMLElement, item: TimelineItem, wake: number, span: number): void {
    const start = item.startMin ?? item.plannedMin ?? wake;
    const end = item.endMin ?? start;
    const block = timeline.createDiv({ cls: `btl-timeline-item is-${item.kind}` });
    const tag = item.tagId
      ? this.plugin.settings.tags.find(candidate => candidate.id === item.tagId)
      : this.plugin.settings.tags.find(candidate => candidate.name === item.tag);
    if (tag) {
      block.addClass("has-tag");
      block.style.setProperty("--btl-tag-color", tag.color);
    }
    block.style.top = `${((start - wake) / span) * 100}%`;
    if (item.kind === "fact") block.style.height = `${Math.max(28, (end - start) * 0.72)}px`;
    const title = block.createDiv({ cls: "btl-item-title", text: item.title });
    if (item.projectPath) title.createSpan({ cls: "btl-item-project", text: ` @${item.projectPath.split("/").pop()?.replace(/\.md$/, "") || ""}` });
    if (item.note) block.createDiv({ cls: "btl-item-note", text: item.note });
    const meta = block.createDiv({ cls: "btl-item-time", text: item.kind === "fact" ? `${timeLabel(start)}–${timeLabel(end)}` : timeLabel(start) });
    const tagName = tag?.name || item.tag;
    if (tagName) meta.createSpan({ text: ` #${tagName}` });
  }

  private openAddMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("记录项目工时").setIcon("timer").onClick(() => void this.plugin.recordProjectWork(this.date)));
    menu.addItem(item => item.setTitle("记录分类时长").setIcon("tags").onClick(() => void this.plugin.recordCategoryDuration(this.date)));
    menu.addItem(item => item.setTitle("打卡习惯").setIcon("check-circle").onClick(() => void this.plugin.toggleHabit(this.date)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("添加项目待办").setIcon("circle-plus").onClick(() => void this.plugin.addProjectTask(this.date)));
    menu.showAtMouseEvent(event);
  }

  private shiftDate(amount: number): void {
    this.date = new Date(this.date.getFullYear(), this.date.getMonth(), this.date.getDate() + amount);
    void this.render();
  }

  private dateTitle(): string {
    const today = dateKey(this.date) === dateKey(new Date());
    return `${this.date.getMonth() + 1}月${this.date.getDate()}日${today ? " · 今天" : ""}`;
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, action: (event: MouseEvent) => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "btl-icon-button", attr: { "aria-label": label, title: label } });
    setIcon(button, icon);
    button.onclick = action;
    return button;
  }
}

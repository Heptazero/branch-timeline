import { App, Modal, setIcon } from "obsidian";
import { fuzzyMatchProjectTask } from "../vault/project-tasks";
import type { FixedReminder, PolicyCard } from "../types";
import { isoWeekday, reminderClock, reminderWeekdays, ruleOn } from "./model";

export interface ReminderDraft {
  title: string;
  minute: number;
  weekdays: number[];
  anchorCardId?: string;
}

export interface ReminderModalOptions {
  reminders: FixedReminder[];
  cards: PolicyCard[];
  today: string;
  initialMinute: number;
  initialAnchorId?: string;
  listForAnchor?: boolean;
  initialReminderId?: string;
  onSave: (draft: ReminderDraft, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export class FixedReminderModal extends Modal {
  constructor(app: App, private options: ReminderModalOptions) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("btl-fixed-modal");
    const original = this.options.reminders.find(item => item.id === this.options.initialReminderId);
    if (original || (this.options.initialAnchorId && !this.options.listForAnchor)) this.renderEditor(original);
    else this.renderList();
  }

  private renderList(): void {
    this.contentEl.empty();
    const head = this.header("定点提醒");
    const add = head.createEl("button", { attr: { type: "button", "aria-label": "添加定点提醒" } });
    setIcon(add, "plus");
    add.onclick = () => this.renderEditor();
    const active = this.options.reminders.filter(item => (!item.archivedDate || item.archivedDate > this.options.today)
      && (!this.options.listForAnchor || ruleOn(item, this.options.today)?.anchorCardId === this.options.initialAnchorId));
    if (!active.length) return;
    for (const reminder of active) {
      const rule = ruleOn(reminder, this.options.today) || reminder.rules.at(-1);
      if (!rule) continue;
      const row = this.contentEl.createEl("button", { cls: "btl-fixed-list-row", attr: { type: "button" } });
      row.createSpan({ cls: "btl-fixed-list-title", text: reminder.title });
      row.createSpan({ cls: "btl-fixed-list-meta", text: `${reminderClock(rule.minute)} · ${reminderWeekdays(rule.weekdays)}` });
      row.onclick = () => this.renderEditor(reminder);
    }
  }

  private renderEditor(original?: FixedReminder): void {
    this.contentEl.empty();
    const head = this.header(original ? "编辑定点提醒" : "添加定点提醒", () => this.renderList());
    if (original) {
      const more = head.createEl("button", { attr: { type: "button", "aria-label": "删除定点提醒" } });
      setIcon(more, "trash-2");
      more.onclick = () => this.renderDelete(original);
    }
    const prior = original && (ruleOn(original, this.options.today) || original.rules.at(-1));
    let minute = prior?.minute ?? this.options.initialMinute;
    const weekdays = new Set(prior?.weekdays || [isoWeekday(this.options.today)]);
    let anchorCardId = prior?.anchorCardId || this.options.initialAnchorId;
    const name = this.contentEl.createEl("input", { cls: "btl-text-input btl-fixed-title", attr: { placeholder: "要做什么", "aria-label": "提醒名称" } });
    name.value = original?.title || "";

    const timeRow = this.contentEl.createDiv({ cls: "btl-fixed-form-row" });
    timeRow.createSpan({ text: "时间" });
    const timeButton = timeRow.createEl("button", { cls: "btl-fixed-time", text: reminderClock(minute), attr: { type: "button", "aria-label": "设置固定时间" } });
    const wheelHost = this.contentEl.createDiv({ cls: "btl-fixed-wheel-host" });
    timeButton.onclick = () => {
      if (wheelHost.hasChildNodes()) { wheelHost.empty(); return; }
      this.renderTimeWheel(wheelHost, minute, value => {
        minute = value;
        timeButton.setText(reminderClock(value));
        wheelHost.empty();
      });
    };

    const weekRow = this.contentEl.createDiv({ cls: "btl-fixed-week" });
    for (let day = 1; day <= 7; day += 1) {
      const button = weekRow.createEl("button", { text: "一二三四五六日"[day - 1], attr: { type: "button", "aria-label": `星期${"一二三四五六日"[day - 1]}` } });
      button.toggleClass("is-selected", weekdays.has(day));
      button.setAttribute("aria-pressed", String(weekdays.has(day)));
      button.onclick = () => {
        if (weekdays.has(day) && weekdays.size === 1) return;
        if (weekdays.has(day)) weekdays.delete(day);
        else weekdays.add(day);
        button.toggleClass("is-selected", weekdays.has(day));
        button.setAttribute("aria-pressed", String(weekdays.has(day)));
      };
    }

    const anchor = this.contentEl.createDiv({ cls: "btl-fixed-anchor" });
    const anchorInput = anchor.createEl("input", { cls: "btl-text-input", attr: { placeholder: "关联锚点（可选）", "aria-label": "搜索关联锚点" } });
    const suggestions = anchor.createDiv({ cls: "btl-fixed-suggestions" });
    const cards = this.options.cards.filter(card => !card.deletedDate || card.deletedDate > this.options.today);
    const selectedName = (): string => cards.find(card => card.id === anchorCardId)?.name || "";
    anchorInput.value = selectedName();
    const renderSuggestions = (): void => {
      suggestions.empty();
      const query = anchorInput.value.trim();
      const matches = cards.filter(card => fuzzyMatchProjectTask(card.name, query)).slice(0, 8);
      suggestions.createEl("button", { text: "不关联", attr: { type: "button" } }).onclick = () => {
        anchorCardId = undefined; anchorInput.value = ""; suggestions.empty();
      };
      for (const card of matches) suggestions.createEl("button", { text: card.name, attr: { type: "button" } }).onclick = () => {
        anchorCardId = card.id; anchorInput.value = card.name; suggestions.empty();
      };
      if (query && !matches.length) suggestions.createDiv({ text: "无匹配锚点" });
    };
    anchorInput.onfocus = renderSuggestions;
    anchorInput.oninput = () => { anchorCardId = undefined; renderSuggestions(); };
    anchorInput.onkeydown = event => {
      if (event.key === "Escape") suggestions.empty();
      if (event.key === "Enter") {
        const first = cards.find(card => fuzzyMatchProjectTask(card.name, anchorInput.value.trim()));
        if (first) { event.preventDefault(); anchorCardId = first.id; anchorInput.value = first.name; suggestions.empty(); }
      }
    };
    const actions = this.contentEl.createDiv({ cls: "btl-fixed-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    const save = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    save.onclick = async () => {
      const title = name.value.trim();
      if (!title) { name.focus(); return; }
      save.disabled = true;
      try {
        await this.options.onSave({ title, minute, weekdays: [...weekdays].sort(), anchorCardId }, original?.id);
        this.close();
      } finally { save.disabled = false; }
    };
    window.setTimeout(() => name.focus(), 0);
  }

  private renderTimeWheel(host: HTMLElement, current: number, select: (minute: number) => void): void {
    host.empty();
    const wheel = host.createDiv({ cls: "btl-time-wheel" });
    let selected = Math.round(current / 5) * 5;
    for (let value = 0; value <= 26 * 60 - 5; value += 5) {
      const button = wheel.createEl("button", { text: reminderClock(value), attr: { type: "button" } });
      button.dataset.minute = String(value);
      button.toggleClass("is-selected", value === selected);
      button.onclick = () => {
        selected = value;
        wheel.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === button));
        button.scrollIntoView({ block: "center", behavior: "smooth" });
      };
    }
    wheel.addEventListener("scroll", () => {
      window.clearTimeout(Number(wheel.dataset.timer || 0));
      wheel.dataset.timer = String(window.setTimeout(() => {
        const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
        const nearest = [...wheel.querySelectorAll<HTMLButtonElement>("button")].sort((a, b) =>
          Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) -
          Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center))[0];
        if (nearest) {
          selected = Number(nearest.dataset.minute);
          wheel.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === nearest));
        }
      }, 80));
    }, { passive: true });
    host.createEl("button", { text: "完成", cls: "mod-cta" }).onclick = () => select(selected);
    window.requestAnimationFrame(() => wheel.querySelector<HTMLElement>(`[data-minute="${selected}"]`)?.scrollIntoView({ block: "center" }));
  }

  private renderDelete(original: FixedReminder): void {
    this.contentEl.empty();
    this.header("删除定点提醒", () => this.renderEditor(original));
    this.contentEl.createDiv({ cls: "btl-fixed-confirm", text: `删除“${original.title}”后，未来不再出现；过去的记录保留。` });
    const actions = this.contentEl.createDiv({ cls: "btl-fixed-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.renderEditor(original);
    actions.createEl("button", { text: "删除", cls: "mod-warning" }).onclick = async () => {
      await this.options.onDelete(original.id);
      this.close();
    };
  }

  private header(title: string, back?: () => void): HTMLElement {
    const head = this.contentEl.createDiv({ cls: "btl-fixed-head" });
    if (back) {
      const button = head.createEl("button", { attr: { type: "button", "aria-label": "返回" } });
      setIcon(button, "chevron-left"); button.onclick = back;
    }
    head.createEl("strong", { text: title });
    return head;
  }
}

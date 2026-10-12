import { App, Menu } from "obsidian";
import type BranchTimelinePlugin from "../main";
import type { FixedReminderResult } from "../types";
import { dateKey, logicalToday } from "../vault/format";
import { reminderOn } from "./model";
import { FixedReminderModal, type ReminderDraft } from "./modal";

export interface FixedReminderActionsOptions {
  app: App;
  plugin: BranchTimelinePlugin;
  getDate: () => Date;
  refresh: () => Promise<void>;
  breakAnchor: (cardId: string) => void;
}

export class FixedReminderActions {
  constructor(private options: FixedReminderActionsOptions) {}

  async openManager(anchorCardId?: string, editId?: string, minute?: number, listForAnchor = false): Promise<void> {
    const state = await this.options.plugin.store.load();
    const today = dateKey(logicalToday());
    new FixedReminderModal(this.options.app, {
      reminders: state.fixedReminders,
      cards: state.policyCards,
      today,
      initialMinute: Math.max(0, Math.min(26 * 60 - 5, Math.round((minute ?? this.currentMinute()) / 5) * 5)),
      initialAnchorId: anchorCardId,
      listForAnchor,
      initialReminderId: editId,
      onSave: (draft, id) => this.save(draft, id),
      onDelete: id => this.archive(id)
    }).open();
  }

  async openOccurrenceMenu(id: string, event: MouseEvent): Promise<void> {
    const state = await this.options.plugin.store.load();
    const reminder = state.fixedReminders.find(item => item.id === id);
    const date = dateKey(this.options.getDate());
    const rule = reminder && reminderOn(reminder, date);
    if (!reminder || !rule) return;
    const recorded = state.fixedReminderResults.find(item => item.reminderId === id && item.date === date);
    const menu = new Menu();
    menu.addItem(item => item.setTitle("做到了").setIcon("check").onClick(() => void this.record(id, date, "done")));
    menu.addItem(item => item.setTitle("没做到").setIcon("x").onClick(() => void this.record(id, date, "missed")));
    if (recorded) menu.addItem(item => item.setTitle("清除这次记录").setIcon("undo-2").onClick(() => void this.clear(id, date)));
    if (recorded?.result === "missed" && rule.anchorCardId && state.policyNodes.some(node => node.cardId === rule.anchorCardId)) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle("将锚点记为破戒").setIcon("alert-circle").setWarning(true)
        .onClick(() => this.options.breakAnchor(rule.anchorCardId!)));
    }
    menu.addSeparator();
    menu.addItem(item => item.setTitle("编辑定点提醒").setIcon("pencil").onClick(() => void this.openManager(undefined, id)));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  private async save(draft: ReminderDraft, id?: string): Promise<void> {
    const today = dateKey(logicalToday());
    await this.options.plugin.store.update(state => {
      const anchorCardId = draft.anchorCardId && state.policyCards.some(card => card.id === draft.anchorCardId && (!card.deletedDate || card.deletedDate > today))
        ? draft.anchorCardId : undefined;
      const reminder = id ? state.fixedReminders.find(item => item.id === id) : undefined;
      const rule = { fromDate: today, minute: draft.minute, weekdays: draft.weekdays, anchorCardId };
      if (reminder) {
        reminder.title = draft.title;
        reminder.rules = [...reminder.rules.filter(item => item.fromDate !== today), rule].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
      } else {
        state.fixedReminders.push({ id: this.uid(), title: draft.title, createdDate: today, rules: [rule] });
      }
    });
    await this.options.plugin.refreshViews();
  }

  private async archive(id: string): Promise<void> {
    const today = dateKey(logicalToday());
    await this.options.plugin.store.update(state => {
      const reminder = state.fixedReminders.find(item => item.id === id);
      if (reminder) reminder.archivedDate = today;
    });
    await this.options.plugin.refreshViews();
  }

  private async record(id: string, date: string, result: FixedReminderResult["result"]): Promise<void> {
    await this.options.plugin.store.update(state => {
      const reminder = state.fixedReminders.find(item => item.id === id);
      if (!reminder || !reminderOn(reminder, date)) return;
      state.fixedReminderResults = state.fixedReminderResults.filter(item => item.reminderId !== id || item.date !== date);
      state.fixedReminderResults.push({ reminderId: id, date, result, recordedMinute: this.currentMinute() });
    });
    await this.options.plugin.refreshViews();
  }

  private async clear(id: string, date: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      state.fixedReminderResults = state.fixedReminderResults.filter(item => item.reminderId !== id || item.date !== date);
    });
    await this.options.plugin.refreshViews();
  }

  private currentMinute(): number {
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    return minute + (now.getHours() < 2 ? 1440 : 0);
  }

  private uid(): string { return `fixed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
}

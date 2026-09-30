import { App, Menu } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { ConfirmModal } from "../modals";
import type { Achievement, AchievementRecord } from "../types";
import { dateKey } from "../vault/format";
import { AchievementRecordModal, type AchievementRecordDraft } from "./achievement-record-modal";

export interface AchievementActionsOptions {
  app: App;
  plugin: BranchTimelinePlugin;
  colors: readonly string[];
  getDate: () => Date;
  refresh: () => Promise<void>;
  text: (title: string, placeholder: string, value?: string) => Promise<string | null>;
  onDeleteAchievement?: (id: string) => void;
}

export class AchievementActions {
  constructor(private options: AchievementActionsOptions) {}

  async add(): Promise<void> {
    const name = await this.options.text("添加成就", "成就名称");
    if (!name) return;
    await this.options.plugin.store.update(state => {
      state.achievements.push({
        id: this.uid("achievement"),
        name,
        color: this.options.colors[state.achievements.length % this.options.colors.length],
        createdDate: dateKey(this.options.getDate()),
        records: [],
        manualDates: []
      });
    });
    await this.options.refresh();
  }

  addRecord(achievement: Achievement): void {
    new AchievementRecordModal(this.options.app, achievement.name, value => {
      if (value) void this.saveRecord(achievement.id, value);
    }).open();
  }

  editRecord(achievement: Achievement, record: AchievementRecord): void {
    new AchievementRecordModal(this.options.app, achievement.name, value => {
      if (value) void this.saveRecord(achievement.id, value, record.id);
    }, record).open();
  }

  openMenu(achievement: Achievement, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.rename(achievement)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(() => {
      const count = achievement.records.length;
      new ConfirmModal(this.options.app, `删除“${achievement.name}”？`, `会同时删除 ${count} 条成就记录，不影响主页、项目或习惯。`, async () => {
        await this.options.plugin.store.update(state => {
          state.achievements = state.achievements.filter(candidate => candidate.id !== achievement.id);
        });
        this.options.onDeleteAchievement?.(achievement.id);
        await this.options.refresh();
      }).open();
    }));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  openRecordMenu(achievement: Achievement, record: AchievementRecord, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("编辑").setIcon("pencil").onClick(() => this.editRecord(achievement, record)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(() => {
      new ConfirmModal(this.options.app, "删除这条记录？", `${record.date} 的记录会被永久删除。`, async () => {
        await this.options.plugin.store.update(state => {
          const target = state.achievements.find(candidate => candidate.id === achievement.id);
          if (target) target.records = target.records.filter(candidate => candidate.id !== record.id);
        });
        await this.options.refresh();
      }).open();
    }));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  private async saveRecord(achievementId: string, value: AchievementRecordDraft, recordId?: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      const achievement = state.achievements.find(candidate => candidate.id === achievementId);
      if (!achievement) return;
      const record = recordId ? achievement.records.find(candidate => candidate.id === recordId) : undefined;
      if (record) Object.assign(record, value);
      else achievement.records.push({ id: this.uid("achievement-record"), ...value });
    });
    await this.options.refresh();
  }

  private async rename(achievement: Achievement): Promise<void> {
    const name = await this.options.text("重命名成就", "成就名称", achievement.name);
    if (!name) return;
    await this.options.plugin.store.update(state => {
      const target = state.achievements.find(candidate => candidate.id === achievement.id);
      if (target) target.name = name;
    });
    await this.options.refresh();
  }

  private uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

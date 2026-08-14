import { App, Menu } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { ConfirmModal } from "../modals";
import type { Achievement } from "../types";
import { dateKey } from "../vault/format";

export interface AchievementActionsOptions {
  app: App;
  plugin: BranchTimelinePlugin;
  colors: readonly string[];
  getDate: () => Date;
  refresh: () => Promise<void>;
  text: (title: string, placeholder: string, value?: string) => Promise<string | null>;
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
        manualDates: []
      });
    });
    await this.options.refresh();
  }

  async toggle(achievementId: string, date: string): Promise<void> {
    await this.options.plugin.store.update(state => {
      const achievement = state.achievements.find(candidate => candidate.id === achievementId);
      if (!achievement) return;
      const index = achievement.manualDates.indexOf(date);
      if (index >= 0) achievement.manualDates.splice(index, 1);
      else achievement.manualDates.push(date);
      achievement.manualDates.sort();
    });
    await this.options.refresh();
  }

  openMenu(achievement: Achievement, event: PointerEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("重命名").setIcon("pencil").onClick(() => void this.rename(achievement)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(() => {
      new ConfirmModal(this.options.app, `删除“${achievement.name}”？`, "只删除成就，其他记录不受影响。", async () => {
        await this.options.plugin.store.update(state => {
          state.achievements = state.achievements.filter(candidate => candidate.id !== achievement.id);
        });
        await this.options.refresh();
      }).open();
    }));
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
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

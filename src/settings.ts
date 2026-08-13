import { App, PluginSettingTab, Setting } from "obsidian";
import type BranchTimelinePlugin from "./main";
import type { BranchTimelineSettings } from "./types";

export const DEFAULT_SETTINGS: BranchTimelineSettings = {
  statePath: "99_assets/branch-timeline/state.json",
  diaryFolder: "20_self/22-diary",
  projectFolder: "21_project",
  habits: ["早睡", "阅读", "对话训练", "写日记"],
  tagMap: { 工作: "work", 探索: "explore", 专注: "", 摸鱼: "", 休息: "" },
  dayStartMinute: 7 * 60,
  dayEndMinute: 26 * 60
};

export class BranchTimelineSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BranchTimelinePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "分支时间线" });

    this.textSetting("数据文件", "分支、节律与决策树的 Vault 内路径。", "statePath");
    this.textSetting("周记目录", "习惯和分类时长写入的位置。", "diaryFolder");
    this.textSetting("项目目录", "扫描 type: project 的范围。", "projectFolder");

    new Setting(containerEl)
      .setName("习惯")
      .setDesc("逗号分隔，需与日记任务名称完全一致。")
      .addText(text => text.setValue(this.plugin.settings.habits.join(", ")).onChange(async value => {
        this.plugin.settings.habits = value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      }));

    containerEl.createEl("h3", { text: "标签映射" });
    for (const label of ["工作", "探索", "专注", "摸鱼", "休息"]) {
      new Setting(containerEl)
        .setName(label)
        .setDesc("留空时不写入周记分类统计。")
        .addText(text => text.setValue(this.plugin.settings.tagMap[label] || "").onChange(async value => {
          this.plugin.settings.tagMap[label] = value.trim();
          await this.plugin.saveSettings();
        }));
    }
  }

  private textSetting(name: string, description: string, key: "statePath" | "diaryFolder" | "projectFolder"): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText(text => text.setValue(this.plugin.settings[key]).onChange(async value => {
        this.plugin.settings[key] = value.trim();
        await this.plugin.saveSettings();
      }));
  }
}

import { App, PluginSettingTab, Setting } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { ConfirmModal } from "./modals";
import { cloneDefaultTags, createTag } from "./tags";
import type { BranchTimelineSettings } from "./types";

export const DEFAULT_SETTINGS: BranchTimelineSettings = {
  statePath: "99_assets/branch-timeline/state.json",
  diaryFolder: "20_self/22-diary",
  projectFolder: "21_project",
  habits: ["早睡", "阅读", "对话训练", "写日记"],
  tags: cloneDefaultTags(),
  dayStartMinute: 7 * 60,
  dayEndMinute: 26 * 60
};

export class BranchTimelineSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BranchTimelinePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Branch Timeline" });

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

    new Setting(containerEl)
      .setName("标签")
      .setHeading()
      .addButton(button => button.setButtonText("添加").setIcon("plus").onClick(async () => {
        this.plugin.settings.tags.push(createTag(this.plugin.settings.tags));
        await this.plugin.saveSettings();
        this.display();
        window.setTimeout(() => this.containerEl.querySelector<HTMLInputElement>(".btl-tag-setting:last-child input")?.select(), 0);
      }));

    for (const tag of this.plugin.settings.tags) {
      const row = new Setting(containerEl).setName(tag.name).setClass("btl-tag-setting");
      row.addText(text => {
        text.setPlaceholder("名称").setValue(tag.name).onChange(async value => {
          tag.name = value;
          row.setName(value.trim() || "未命名标签");
          await this.plugin.saveSettings();
        });
        text.inputEl.setAttr("aria-label", "标签名称");
      });
      row.addText(text => {
        text.setPlaceholder("周记键").setValue(tag.category).onChange(async value => {
          tag.category = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.setAttr("aria-label", "周记分类键");
      });
      row.addColorPicker(color => color.setValue(tag.color).onChange(async value => {
        tag.color = value;
        await this.plugin.saveSettings();
      }));
      row.addExtraButton(button => button.setIcon("trash-2").setTooltip("删除标签").onClick(() => {
        new ConfirmModal(
          this.app,
          `删除“${tag.name}”？`,
          "只删除标签配置；已有时间记录保留原名称。",
          async () => {
            this.plugin.settings.tags = this.plugin.settings.tags.filter(item => item.id !== tag.id);
            await this.plugin.saveSettings();
            this.display();
          }
        ).open();
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

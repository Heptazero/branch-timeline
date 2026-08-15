import { App, PluginSettingTab, Setting } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { ConfirmModal } from "./modals";
import { openRhythmSchedulePopover } from "./rhythm-popover";
import { DEFAULT_RHYTHM, RHYTHM_KEYS, rhythmLabel } from "./rhythm";
import { cloneDefaultTags, createTag } from "./tags";
import type { BranchTimelineSettings } from "./types";

const OPTIONAL_PAGES: ReadonlyArray<{ id: "projects" | "habits" | "achievements" | "policy"; label: string }> = [
  { id: "projects", label: "项目" },
  { id: "habits", label: "习惯" },
  { id: "achievements", label: "成就" },
  { id: "policy", label: "锚点" }
];

export const DEFAULT_SETTINGS: BranchTimelineSettings = {
  statePath: "99_assets/branch-timeline/state.json",
  diaryFolder: "20_self/22-diary",
  projectFolder: "21_project",
  habits: ["早睡", "阅读", "对话训练", "写日记"],
  tags: cloneDefaultTags(),
  rhythm: { ...DEFAULT_RHYTHM },
  rhythmLabels: { wake: "起床", napStart: "午休开始", napEnd: "午休结束", sleepPrep: "睡眠准备", sleep: "入睡" },
  rhythmElapsedMark: "↑",
  rhythmRemainingMark: "↓",
  visiblePages: ["day", "projects", "habits", "achievements", "policy"],
  projectOrder: [],
  pinnedProjects: [],
  collapsedProjectGroups: [],
  policySceneWidths: {},
  habitCardOrder: ["week", "month", "sleep", "tags"]
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

    new Setting(containerEl).setName("节律").setHeading();
    for (const key of RHYTHM_KEYS) {
      new Setting(containerEl)
        .setName(rhythmLabel(key, this.plugin.settings.rhythmLabels))
        .addText(text => text
          .setValue(this.plugin.settings.rhythmLabels[key])
          .setPlaceholder(rhythmLabel(key))
          .onChange(async value => {
            this.plugin.settings.rhythmLabels = { ...this.plugin.settings.rhythmLabels, [key]: value.trim() || rhythmLabel(key) };
            await this.plugin.saveSettings();
          }))
        .addButton(button => {
          const refresh = () => button.setButtonText(this.timeLabel(this.plugin.settings.rhythm[key]));
          refresh();
          button.onClick(() => openRhythmSchedulePopover(
            button.buttonEl,
            this.plugin.settings.rhythm,
            async next => {
              this.plugin.settings.rhythm = next;
              refresh();
              await this.plugin.saveSettings();
            },
            key,
            this.plugin.settings.rhythmLabels
          ));
        });
    }
    this.textSetting("经过标记", "午休结束前显示在计时左侧。", "rhythmElapsedMark");
    this.textSetting("剩余标记", "午休结束后显示在计时左侧。", "rhythmRemainingMark");

    new Setting(containerEl).setName("页面").setHeading();
    for (const page of OPTIONAL_PAGES) {
      new Setting(containerEl)
        .setName(page.label)
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.visiblePages.includes(page.id))
          .onChange(async visible => {
            const pages = new Set(this.plugin.settings.visiblePages);
            if (visible) pages.add(page.id);
            else pages.delete(page.id);
            this.plugin.settings.visiblePages = ["day", ...OPTIONAL_PAGES.map(item => item.id).filter(id => pages.has(id))];
            await this.plugin.saveSettings();
          }));
    }

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
      const row = new Setting(containerEl).setClass("btl-tag-setting");
      row.addText(text => {
        text.setPlaceholder("标签名称").setValue(tag.name).onChange(async value => {
          tag.name = value;
          await this.plugin.saveSettings();
        });
        text.inputEl.setAttr("aria-label", "标签名称");
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

  private textSetting(
    name: string,
    description: string,
    key: "statePath" | "diaryFolder" | "projectFolder" | "rhythmElapsedMark" | "rhythmRemainingMark"
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText(text => text.setValue(this.plugin.settings[key]).onChange(async value => {
        this.plugin.settings[key] = value.trim();
        await this.plugin.saveSettings();
      }));
  }

  private timeLabel(minute: number): string {
    const normalized = ((minute % 1440) + 1440) % 1440;
    const time = `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
    return minute >= 1440 ? `${time} · 次日` : time;
  }
}

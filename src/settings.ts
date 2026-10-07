import { AbstractInputSuggest, App, PluginSettingTab, Setting } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { installLongPressSort } from "./interactions/long-press-sort";
import { ConfirmModal } from "./modals";
import { DEFAULT_RHYTHM, DEFAULT_RHYTHM_MARKERS } from "./rhythm";
import type { BranchTimelineSettings, ItemMetadataRequirement } from "./types";
import { normalizeTaskHeadings } from "./vault/project-tasks";

const PROJECT_TYPE_COLORS = ["#3b6ea5", "#a5573b", "#7a3ba5", "#2e8b74", "#a53b6e"];

const METADATA_REQUIREMENTS: ReadonlyArray<{ value: ItemMetadataRequirement; label: string }> = [
  { value: "none", label: "不强制" },
  { value: "project", label: "项目" }
];

interface ProjectTypeSuggestion { value: string; custom: boolean }

class ProjectTypeSuggest extends AbstractInputSuggest<ProjectTypeSuggestion> {
  constructor(app: App, input: HTMLInputElement, private candidates: readonly string[], private choose: (value: string) => void) {
    super(app, input);
    this.limit = 30;
  }

  protected getSuggestions(query: string): ProjectTypeSuggestion[] {
    const value = query.trim();
    if (!value) return this.candidates.map(candidate => ({ value: candidate, custom: false }));
    const matches = this.candidates
      .map(candidate => ({ candidate, score: fuzzyScore(candidate, value) }))
      .filter((result): result is { candidate: string; score: number } => result.score != null)
      .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate, "zh-CN"))
      .map(result => ({ value: result.candidate, custom: false }));
    return matches.length ? matches : [{ value, custom: true }];
  }

  renderSuggestion(suggestion: ProjectTypeSuggestion, el: HTMLElement): void {
    el.setText(suggestion.custom ? `使用“${suggestion.value}”` : suggestion.value);
  }

  selectSuggestion(suggestion: ProjectTypeSuggestion): void {
    this.setValue(suggestion.value);
    this.choose(suggestion.value);
    this.close();
  }
}

const OPTIONAL_PAGES: ReadonlyArray<{ id: Exclude<BranchTimelineSettings["visiblePages"][number], "day">; label: string }> = [
  { id: "projects", label: "项目" },
  { id: "habits", label: "统计" },
  { id: "achievements", label: "成就" },
  { id: "policy", label: "锚点" },
  { id: "life", label: "人生" }
];

export const DEFAULT_SETTINGS: BranchTimelineSettings = {
  statePath: "99_assets/branch-timeline/state.json",
  diaryFolder: "20_self/22-diary",
  projectFolder: "21_project",
  projectTypes: [{ type: "project", color: PROJECT_TYPE_COLORS[0] }],
  projectTaskHeadings: ["任务"],
  linkProjectWorkTasks: false,
  lastProjectTasks: {},
  lastProjectTaskHeadings: {},
  itemMetadataRequirement: "none",
  habits: ["早睡", "阅读", "对话训练", "写日记"],
  tags: [],
  rhythm: { ...DEFAULT_RHYTHM },
  rhythmMarkers: DEFAULT_RHYTHM_MARKERS.map(marker => ({ ...marker })),
  rhythmLabels: { wake: "起床", napStart: "午休开始", napEnd: "午休结束", sleepPrep: "睡眠准备", sleep: "入睡" },
  rhythmElapsedMark: "↑",
  rhythmRemainingMark: "↓",
  timerReminderMinutes: 45,
  visiblePages: ["day", "projects", "habits", "achievements", "policy", "life"],
  pageVisibilityVersion: 2,
  projectOrder: [],
  pinnedProjects: [],
  collapsedProjectGroups: [],
  policySceneWidths: {},
  habitCardOrder: ["week", "month", "sleep"]
};

export class BranchTimelineSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: BranchTimelinePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Branch Timeline" });

    this.textSetting("数据文件", "分支、节律与决策树的 Vault 内路径。", "statePath");
    this.textSetting("周记目录", "习惯数据写入的位置。", "diaryFolder");

    new Setting(containerEl)
      .setName("项目页 type（全库）")
      .setHeading()
      .addButton(button => button.setButtonText("添加").setIcon("plus").onClick(async () => {
        this.plugin.settings.projectTypes.push({
          type: "",
          color: PROJECT_TYPE_COLORS[this.plugin.settings.projectTypes.length % PROJECT_TYPE_COLORS.length]
        });
        await this.plugin.saveSettings();
        this.redisplay(() => this.containerEl.querySelector<HTMLInputElement>(".btl-project-type-setting:last-child input")?.focus());
      }));

    const projectTypeList = containerEl.createDiv({ cls: "btl-project-type-list" });
    const typeCandidates = this.vaultTypes();
    for (const [index, projectType] of this.plugin.settings.projectTypes.entries()) {
      const row = new Setting(projectTypeList).setClass("btl-project-type-setting");
      row.settingEl.setAttr("data-project-type-index", String(index));
      row.addText(text => {
        text.setPlaceholder("type").setValue(projectType.type).onChange(async value => {
          projectType.type = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.setAttr("aria-label", "项目页 type");
        new ProjectTypeSuggest(this.app, text.inputEl, typeCandidates, value => {
          projectType.type = value;
          void this.plugin.saveSettings();
        });
      });
      row.addColorPicker(color => color.setValue(projectType.color).onChange(async value => {
        projectType.color = value;
        await this.plugin.saveSettings();
      }));
      row.addExtraButton(button => button.setIcon("trash-2").setTooltip("删除 type").onClick(() => {
        new ConfirmModal(
          this.app,
          `删除 type“${projectType.type || "未命名"}”？`,
          "只停止在项目页展示，不删除文件或时间记录。",
          async () => {
            this.plugin.settings.projectTypes = this.plugin.settings.projectTypes.filter(item => item !== projectType);
            await this.plugin.saveSettings();
            this.redisplay();
          }
        ).open();
      }));
      row.addExtraButton(button => {
        button.setIcon("grip-vertical").setTooltip("拖动排序");
        button.extraSettingsEl.addClass("btl-project-type-drag");
      });
    }
    installLongPressSort(projectTypeList, {
      itemSelector: ".btl-project-type-setting",
      idAttribute: "data-project-type-index",
      handleSelector: ".btl-project-type-drag",
      axis: "vertical",
      onOrder: indexes => void this.reorderProjectTypes(indexes)
    });

    new Setting(containerEl)
      .setName("项目任务标题")
      .setDesc("每行一个标题；搜索时包含它下面的所有次级标题。也可写“任务 / 本周”指定路径。")
      .addTextArea(text => {
        text.setValue(this.plugin.settings.projectTaskHeadings.join("\n")).setPlaceholder("任务");
        text.inputEl.rows = 3;
        text.inputEl.addEventListener("blur", () => {
          this.plugin.settings.projectTaskHeadings = normalizeTaskHeadings(text.inputEl.value.split("\n"));
          void this.plugin.saveSettings(false);
        });
      });

    const metadataRequirement = new Setting(containerEl).setName("双击创建强制归属");
    const requirementControl = metadataRequirement.controlEl.createDiv({ cls: "btl-setting-segments" });
    for (const option of METADATA_REQUIREMENTS) {
      const button = requirementControl.createEl("button", {
        text: option.label,
        attr: { type: "button", "aria-pressed": String(this.plugin.settings.itemMetadataRequirement === option.value) }
      });
      button.toggleClass("is-active", this.plugin.settings.itemMetadataRequirement === option.value);
      button.onclick = async () => {
        this.plugin.settings.itemMetadataRequirement = option.value;
        for (const sibling of Array.from(requirementControl.children)) {
          const active = sibling === button;
          sibling.toggleClass("is-active", active);
          sibling.setAttr("aria-pressed", String(active));
        }
        await this.plugin.saveSettings();
      };
    }

    this.textSetting("经过标记", "一天前半段显示在计时左侧。", "rhythmElapsedMark");
    this.textSetting("剩余标记", "一天后半段显示在计时左侧。", "rhythmRemainingMark");
    new Setting(containerEl)
      .setName("计时提醒")
      .setDesc("持续计时达到该分钟数时提醒；0 表示关闭。")
      .addText(text => text
        .setValue(String(this.plugin.settings.timerReminderMinutes))
        .setPlaceholder("45")
        .onChange(async value => {
          const minutes = Math.max(0, Math.round(Number(value) || 0));
          this.plugin.settings.timerReminderMinutes = minutes;
          await this.plugin.saveSettings(false);
        }));

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

  }

  private textSetting(
    name: string,
    description: string,
    key: "statePath" | "diaryFolder" | "rhythmElapsedMark" | "rhythmRemainingMark"
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText(text => text.setValue(this.plugin.settings[key]).onChange(async value => {
        this.plugin.settings[key] = value.trim();
        await this.plugin.saveSettings();
      }));
  }

  private vaultTypes(): string[] {
    const values = new Set(this.plugin.settings.projectTypes.map(item => item.type.trim()).filter(Boolean));
    for (const file of this.app.vault.getMarkdownFiles()) {
      const type = this.app.metadataCache.getFileCache(file)?.frontmatter?.type;
      if (typeof type === "string" && type.trim()) values.add(type.trim());
    }
    return [...values].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  private async reorderProjectTypes(indexes: string[]): Promise<void> {
    const current = [...this.plugin.settings.projectTypes];
    const reordered = indexes.map(value => current[Number(value)]).filter(Boolean);
    if (reordered.length !== current.length) return;
    this.plugin.settings.projectTypes = reordered;
    await this.plugin.saveSettings();
  }

  private redisplay(after?: () => void): void {
    const positions: Array<{ element: HTMLElement; top: number; left: number }> = [];
    let element: HTMLElement | null = this.containerEl;
    while (element) {
      positions.push({ element, top: element.scrollTop, left: element.scrollLeft });
      element = element.parentElement;
    }
    this.display();
    const restore = () => {
      for (const position of positions) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
    };
    restore();
    window.requestAnimationFrame(() => {
      restore();
      after?.();
    });
  }

}

function fuzzyScore(candidate: string, query: string): number | null {
  const text = candidate.toLowerCase();
  const needle = query.toLowerCase();
  const substring = text.indexOf(needle);
  if (substring >= 0) return substring * 2 + (text.startsWith(needle) ? 0 : 1);
  let cursor = -1;
  let gap = 0;
  for (const character of needle) {
    const next = text.indexOf(character, cursor + 1);
    if (next < 0) return null;
    if (cursor >= 0) gap += next - cursor - 1;
    cursor = next;
  }
  return 100 + gap + cursor;
}

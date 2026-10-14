import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { installLongPressSort } from "./interactions/long-press-sort";
import { ConfirmModal } from "./modals";
import { DEFAULT_RHYTHM, DEFAULT_RHYTHM_MARKERS } from "./rhythm";
import type { BranchTimelineSettings, ItemMetadataRequirement } from "./types";
import { normalizeTaskHeadings } from "./vault/project-tasks";
import { compileFormat } from "./pages/life-diary";
import { renderMentalStateSettings } from "./focus-state-settings";
import { DEFAULT_FOCUS_COLORS } from "./focus-rhythm-color";
import { renderFocusColorSettings } from "./focus-color-settings";

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

const SETTINGS_GROUPS = [
  { id: "data", label: "数据", sections: ["storage", "life"] },
  { id: "projects", label: "项目", sections: ["types", "tasks", "creation"] },
  { id: "timer", label: "计时", sections: ["marks", "mental", "reminder"] },
  { id: "pages", label: "页面", sections: ["visibility"] }
] as const;

type SettingsGroupId = typeof SETTINGS_GROUPS[number]["id"];
type SettingsSectionId = typeof SETTINGS_GROUPS[number]["sections"][number];

export const DEFAULT_SETTINGS: BranchTimelineSettings = {
  statePath: "99_assets/branch-timeline/state.json",
  diaryFolder: "20_self/22-diary",
  lifeDiaryFormats: ["[event] {内容}"],
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
  mentalStateLabels: [],
  focusColors: { ...DEFAULT_FOCUS_COLORS },
  visiblePages: ["day", "projects", "habits", "achievements", "policy", "life"],
  pageVisibilityVersion: 2,
  projectOrder: [],
  pinnedProjects: [],
  collapsedProjectGroups: [],
  policySceneWidths: {},
  habitCardOrder: ["week", "month", "sleep"]
};

export class BranchTimelineSettingTab extends PluginSettingTab {
  private activeGroup: SettingsGroupId = "data";
  private openSections: Partial<Record<SettingsSectionId, boolean>> = {};
  private searchQuery = "";

  constructor(app: App, private plugin: BranchTimelinePlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const root = containerEl.createDiv({ cls: "btl-settings-root" });
    new Setting(root).setName("Branch Timeline").setHeading().setClass("btl-settings-heading");

    const search = root.createDiv({ cls: "btl-settings-search" });
    setIcon(search.createSpan(), "search");
    const searchInput = search.createEl("input", {
      type: "search",
      attr: { placeholder: "搜索设置", "aria-label": "搜索设置" }
    });
    searchInput.value = this.searchQuery;
    const clearSearch = search.createEl("button", {
      attr: { type: "button", "aria-label": "清除搜索", title: "清除搜索" }
    });
    setIcon(clearSearch, "x");

    const tabs = root.createDiv({ cls: "btl-settings-tabs", attr: { role: "tablist", "aria-label": "设置分类" } });
    const panels = new Map<SettingsGroupId, HTMLElement>();
    const tabButtons = new Map<SettingsGroupId, HTMLButtonElement>();
    const sections = new Map<SettingsSectionId, HTMLDetailsElement>();
    for (const group of SETTINGS_GROUPS) {
      const button = tabs.createEl("button", { text: group.label, attr: { type: "button", role: "tab" } });
      button.id = `btl-settings-tab-${group.id}`;
      button.setAttr("aria-controls", `btl-settings-panel-${group.id}`);
      tabButtons.set(group.id, button);
      const panel = root.createDiv({ cls: "btl-settings-panel", attr: { role: "tabpanel", id: `btl-settings-panel-${group.id}` } });
      panel.setAttr("aria-labelledby", button.id);
      panel.createDiv({ cls: "btl-settings-search-group", text: group.label });
      panels.set(group.id, panel);
    }
    const noResults = root.createDiv({ cls: "btl-settings-empty", text: "没有匹配的设置" });

    const section = (group: SettingsGroupId, id: SettingsSectionId, title: string, keywords: string) => {
      const details = panels.get(group)!.createEl("details", { cls: "btl-settings-section" });
      details.dataset.sectionId = id;
      details.dataset.search = `${title} ${keywords}`;
      details.open = this.openSections[id] ?? ["storage", "types", "marks", "visibility"].includes(id);
      const summary = details.createEl("summary", { cls: "btl-settings-section-summary" });
      summary.createSpan({ text: title });
      summary.addEventListener("click", () => {
        if (!searchInput.value.trim()) this.openSections[id] = !details.open;
      });
      sections.set(id, details);
      return { body: details.createDiv({ cls: "btl-settings-section-body" }), summary };
    };

    const storage = section("data", "storage", "文件位置", "数据文件 周记目录 Vault 路径");
    this.textSetting(storage.body, "数据文件", "分支、节律与决策树的 Vault 内路径。", "statePath");
    this.textSetting(storage.body, "周记目录", "习惯数据写入的位置。", "diaryFolder");
    const life = section("data", "life", "人生时间线", "人生页日记格式 周记 内容 event");

    new Setting(life.body).setName("日记格式")
      .setDesc("每行一种格式；{内容} 是时间线上显示的文字，如 [event] {内容}。只读取现有周记。")
      .addTextArea(text => {
        text.setValue(this.plugin.settings.lifeDiaryFormats.join("\n"));
        text.inputEl.rows = 3;
        text.inputEl.addEventListener("blur", () => {
          const formats = text.inputEl.value.split("\n").map(value => value.trim()).filter(Boolean);
          if (formats.some(format => !compileFormat(format))) { new Notice("每种格式都要有且仅有一个 {内容}"); return; }
          this.plugin.settings.lifeDiaryFormats = formats;
          void this.plugin.saveSettings();
        });
      });

    const types = section("projects", "types", "项目类型", "type 颜色 全库 添加 拖动排序");
    const addType = types.summary.createEl("button", {
      cls: "btl-settings-section-action",
      attr: { type: "button", "aria-label": "添加项目类型", title: "添加项目类型" }
    });
    setIcon(addType, "plus");
    addType.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.settings.projectTypes.push({
        type: "",
        color: PROJECT_TYPE_COLORS[this.plugin.settings.projectTypes.length % PROJECT_TYPE_COLORS.length]
      });
      this.openSections.types = true;
      await this.plugin.saveSettings();
      this.redisplay(() => this.containerEl.querySelector<HTMLInputElement>(".btl-project-type-setting:last-child input")?.focus());
    });

    const projectTypeList = types.body.createDiv({ cls: "btl-project-type-list" });
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

    const tasks = section("projects", "tasks", "项目任务", "任务标题 搜索 关联 次级标题");
    new Setting(tasks.body)
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

    const creation = section("projects", "creation", "创建规则", "双击创建 强制归属 项目");
    const metadataRequirement = new Setting(creation.body).setName("双击创建强制归属");
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

    const marks = section("timer", "marks", "时间标记", "经过标记 剩余标记 节律");
    this.textSetting(marks.body, "经过标记", "一天前半段显示在计时左侧。", "rhythmElapsedMark");
    this.textSetting(marks.body, "剩余标记", "一天后半段显示在计时左侧。", "rhythmRemainingMark");
    const mental = section("timer", "mental", "可用脑力", "状态 红蓝 渐变 默认位置 分神 专注");
    renderFocusColorSettings(mental.body, this.plugin.settings.focusColors, () => this.plugin.saveSettings());
    renderMentalStateSettings(mental.body, this.plugin.settings.mentalStateLabels,
      () => this.plugin.saveSettings(false), focusLast => this.redisplay(focusLast
        ? () => this.containerEl.querySelector<HTMLInputElement>(".btl-mental-state-row:last-child input[type=text]")?.focus()
        : undefined));
    const reminder = section("timer", "reminder", "提醒", "计时提醒 分钟");
    new Setting(reminder.body)
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

    const visibility = section("pages", "visibility", "可见页面", "项目 统计 成就 锚点 人生");
    for (const page of OPTIONAL_PAGES) {
      new Setting(visibility.body)
        .setName(page.label)
        .setClass("btl-settings-toggle")
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

    const update = () => {
      const query = searchInput.value.trim();
      this.searchQuery = query;
      tabs.hidden = !!query;
      clearSearch.hidden = !query;
      let hasResults = false;
      for (const group of SETTINGS_GROUPS) {
        const panel = panels.get(group.id)!;
        let matched = false;
        const groupMatch = fuzzyScore(group.label, query) != null;
        for (const id of group.sections) {
          const details = sections.get(id)!;
          const visible = !query || groupMatch || fuzzyScore(details.dataset.search || "", query) != null;
          details.hidden = !visible;
          if (query && visible) details.open = true;
          else if (!query) details.open = this.openSections[id] ?? ["storage", "types", "marks", "visibility"].includes(id);
          matched ||= visible;
        }
        panel.hidden = query ? !matched : group.id !== this.activeGroup;
        hasResults ||= matched;
        panel.querySelector<HTMLElement>(".btl-settings-search-group")!.hidden = !query;
        const button = tabButtons.get(group.id)!;
        button.setAttr("aria-selected", String(group.id === this.activeGroup));
        button.tabIndex = group.id === this.activeGroup ? 0 : -1;
      }
      noResults.hidden = !query || hasResults;
    };
    for (const group of SETTINGS_GROUPS) {
      const button = tabButtons.get(group.id)!;
      button.addEventListener("click", () => { this.activeGroup = group.id; update(); });
      button.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = SETTINGS_GROUPS.findIndex(item => item.id === group.id);
        const next = SETTINGS_GROUPS[(index + (event.key === "ArrowRight" ? 1 : -1) + SETTINGS_GROUPS.length) % SETTINGS_GROUPS.length];
        this.activeGroup = next.id;
        tabButtons.get(next.id)?.focus();
        update();
      });
    }
    searchInput.addEventListener("input", update);
    searchInput.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !searchInput.value) return;
      searchInput.value = "";
      update();
    });
    clearSearch.addEventListener("click", () => { searchInput.value = ""; update(); searchInput.focus(); });
    update();
  }

  private textSetting(
    parent: HTMLElement,
    name: string,
    description: string,
    key: "statePath" | "diaryFolder" | "rhythmElapsedMark" | "rhythmRemainingMark"
  ): void {
    new Setting(parent)
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

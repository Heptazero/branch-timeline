import { App, FuzzySuggestModal, Menu, Modal } from "obsidian";
import type { ProjectRef, TimelineTag } from "./types";

export class ProjectSuggestModal extends FuzzySuggestModal<ProjectRef> {
  constructor(app: App, private projects: ProjectRef[], private resolve: (project: ProjectRef | null) => void) {
    super(app);
    this.setPlaceholder("选择项目");
  }
  getItems(): ProjectRef[] { return this.projects; }
  getItemText(item: ProjectRef): string { return item.name; }
  onChooseItem(item: ProjectRef): void { this.resolve(item); }
  onClose(): void { window.setTimeout(() => this.resolve(null), 0); }
}

export interface ChoiceItem { id: string; label: string }

export interface ChoiceTextResult { text: string; choice: string }

export class ChoiceSuggestModal extends FuzzySuggestModal<ChoiceItem> {
  private chosen = false;
  constructor(app: App, private title: string, private items: ChoiceItem[], private resolve: (item: ChoiceItem | null) => void) {
    super(app);
    this.setPlaceholder(title);
  }
  getItems(): ChoiceItem[] { return this.items; }
  getItemText(item: ChoiceItem): string { return item.label; }
  onChooseItem(item: ChoiceItem): void { this.chosen = true; this.resolve(item); }
  onClose(): void { if (!this.chosen) this.resolve(null); }
}

export class TextEntryModal extends Modal {
  private value: string;
  constructor(app: App, private title: string, private placeholder: string, private resolve: (value: string | null) => void, value = "") {
    super(app);
    this.value = value;
  }
  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    const input = this.contentEl.createEl("input", { cls: "btl-text-input", value: this.value, attr: { placeholder: this.placeholder } });
    input.addEventListener("input", () => { this.value = input.value; });
    input.addEventListener("keydown", event => { if (event.key === "Enter") this.submit(); });
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: "添加", cls: "mod-cta" }).onclick = () => this.submit();
    window.setTimeout(() => input.focus(), 30);
  }
  onClose(): void { this.contentEl.empty(); }
  private submit(): void {
    const value = this.value.trim();
    if (!value) return;
    this.resolve(value);
    this.resolve = () => undefined;
    this.close();
  }
}

export class TextareaEntryModal extends Modal {
  private value: string;
  private resolved = false;

  constructor(app: App, private title: string, private placeholder: string, private resolve: (value: string | null) => void, value = "") {
    super(app);
    this.value = value;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    const input = this.contentEl.createEl("textarea", {
      cls: "btl-textarea",
      text: this.value,
      attr: { placeholder: this.placeholder, rows: "5" }
    });
    input.value = this.value;
    input.oninput = () => { this.value = input.value; };
    input.onkeydown = event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) this.submit();
    };
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: "保存", cls: "mod-cta" }).onclick = () => this.submit();
    window.setTimeout(() => input.focus(), 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private submit(): void {
    this.resolved = true;
    this.resolve(this.value.trim());
    this.close();
  }
}

export interface TimelineItemDraftResult {
  title: string;
  note: string;
  projectPath: string | null;
  tagId: string | null;
}

export class TimelineItemDraftModal extends Modal {
  private titleValue = "";
  private noteValue = "";
  private projectPath: string | null = null;
  private tagId: string | null = null;
  private resolved = false;
  private projectButton!: HTMLButtonElement;
  private tagButton!: HTMLButtonElement;
  private submitButton!: HTMLButtonElement;

  constructor(
    app: App,
    private projects: readonly ProjectRef[],
    private tags: readonly TimelineTag[],
    private requireMetadata: boolean,
    private resolve: (value: TimelineItemDraftResult | null) => void
  ) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.addClass("btl-item-compose");
    this.contentEl.createEl("h3", { text: "添加代办" });
    const title = this.contentEl.createEl("input", {
      cls: "btl-text-input",
      attr: { placeholder: "代办内容", "aria-label": "代办内容" }
    });
    title.oninput = () => { this.titleValue = title.value; this.refreshSubmit(); };
    title.onkeydown = event => { if (event.key === "Enter") this.submit(); };
    const note = this.contentEl.createEl("textarea", {
      cls: "btl-textarea btl-item-compose-note",
      attr: { placeholder: "备注（可选）", rows: "4", "aria-label": "备注" }
    });
    note.oninput = () => { this.noteValue = note.value; };

    const selectors = this.contentEl.createDiv({ cls: "btl-item-compose-selectors" });
    this.projectButton = selectors.createEl("button", { attr: { type: "button" } });
    this.projectButton.onclick = event => this.openProjectMenu(event);
    this.tagButton = selectors.createEl("button", { attr: { type: "button" } });
    this.tagButton.onclick = event => this.openTagMenu(event);
    this.refreshSelectors();

    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    this.submitButton = actions.createEl("button", { text: "添加", cls: "mod-cta" });
    this.submitButton.onclick = () => this.submit();
    this.refreshSubmit();
    window.setTimeout(() => title.focus(), 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private openProjectMenu(event: MouseEvent): void {
    const menu = new Menu();
    if (!this.requireMetadata) {
      menu.addItem(item => item.setTitle("无项目").setChecked(!this.projectPath).onClick(() => {
        this.projectPath = null;
        this.refreshSelectors();
        this.refreshSubmit();
      }));
      menu.addSeparator();
    }
    if (!this.projects.length) menu.addItem(item => item.setTitle("没有进行中的项目").setDisabled(true));
    for (const project of this.projects) {
      menu.addItem(item => item.setTitle(project.name).setChecked(this.projectPath === project.path).onClick(() => {
        this.projectPath = project.path;
        this.refreshSelectors();
        this.refreshSubmit();
      }));
    }
    menu.showAtMouseEvent(event);
  }

  private openTagMenu(event: MouseEvent): void {
    const menu = new Menu();
    if (!this.requireMetadata) {
      menu.addItem(item => item.setTitle("无标签").setChecked(!this.tagId).onClick(() => {
        this.tagId = null;
        this.refreshSelectors();
        this.refreshSubmit();
      }));
      menu.addSeparator();
    }
    if (!this.tags.length) menu.addItem(item => item.setTitle("没有标签").setDisabled(true));
    for (const tag of this.tags) {
      menu.addItem(item => item.setTitle(tag.name).setChecked(this.tagId === tag.id).onClick(() => {
        this.tagId = tag.id;
        this.refreshSelectors();
        this.refreshSubmit();
      }));
    }
    menu.showAtMouseEvent(event);
  }

  private refreshSelectors(): void {
    const project = this.projects.find(item => item.path === this.projectPath);
    const tag = this.tags.find(item => item.id === this.tagId);
    this.projectButton.setText(project ? `@${project.name}` : "选择项目");
    this.tagButton.setText(tag ? `#${tag.name}` : "选择标签");
    this.projectButton.toggleClass("is-selected", !!project);
    this.tagButton.toggleClass("is-selected", !!tag);
    this.projectButton.style.setProperty("--btl-choice-color", project?.color || "var(--interactive-accent)");
    this.tagButton.style.setProperty("--btl-choice-color", tag?.color || "var(--interactive-accent)");
  }

  private refreshSubmit(): void {
    if (!this.submitButton) return;
    this.submitButton.disabled = !this.titleValue.trim() || (this.requireMetadata && (!this.projectPath || !this.tagId));
  }

  private submit(): void {
    if (!this.titleValue.trim() || (this.requireMetadata && (!this.projectPath || !this.tagId))) return;
    this.resolved = true;
    this.resolve({
      title: this.titleValue.trim(),
      note: this.noteValue.trim(),
      projectPath: this.projectPath,
      tagId: this.tagId
    });
    this.close();
  }
}

export class MinuteEntryModal extends Modal {
  private value = "30";
  private resolved = false;

  constructor(app: App, private title: string, private resolve: (minutes: number | null) => void) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    const row = this.contentEl.createDiv({ cls: "btl-minute-entry" });
    const input = row.createEl("input", {
      cls: "btl-text-input",
      value: this.value,
      attr: { type: "number", min: "1", step: "1", inputmode: "numeric", "aria-label": "补记分钟数" }
    });
    row.createSpan({ text: "分钟" });
    input.oninput = () => { this.value = input.value; };
    input.onkeydown = event => { if (event.key === "Enter") this.submit(input); };
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: "补记", cls: "mod-cta" }).onclick = () => this.submit(input);
    window.setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private submit(input: HTMLInputElement): void {
    const minutes = Math.round(Number(this.value));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      input.focus();
      input.select();
      return;
    }
    this.resolved = true;
    this.resolve(minutes);
    this.close();
  }
}

export class ChoiceTextModal extends Modal {
  private value: string;
  private selected: string;
  private resolved = false;

  constructor(
    app: App,
    private title: string,
    private placeholder: string,
    private choices: readonly ChoiceItem[],
    selected: string,
    private resolve: (value: ChoiceTextResult | null) => void,
    value = ""
  ) {
    super(app);
    this.value = value;
    this.selected = selected;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    const input = this.contentEl.createEl("input", { cls: "btl-text-input", value: this.value, attr: { placeholder: this.placeholder } });
    input.oninput = () => { this.value = input.value; };
    input.onkeydown = event => { if (event.key === "Enter") this.submit(); };
    const pills = this.contentEl.createDiv({ cls: "btl-choice-pills" });
    for (const choice of this.choices) {
      const button = pills.createEl("button", { text: choice.label, attr: { type: "button" } });
      button.toggleClass("is-selected", choice.id === this.selected);
      button.onclick = () => {
        this.selected = choice.id;
        pills.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === button));
      };
    }
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: "添加", cls: "mod-cta" }).onclick = () => this.submit();
    window.setTimeout(() => input.focus(), 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private submit(): void {
    const text = this.value.trim();
    if (!text) return;
    this.resolved = true;
    this.resolve({ text, choice: this.selected });
    this.close();
  }
}

export interface DurationResult { minutes: number; note: string }

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private message: string,
    private confirm: () => void | Promise<void>,
    private confirmLabel = "删除"
  ) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: this.confirmLabel, cls: "mod-warning" }).onclick = () => {
      this.close();
      void this.confirm();
    };
  }

  onClose(): void { this.contentEl.empty(); }
}

export class DurationModal extends Modal {
  private selected = 30;
  private note = "";
  private resolved = false;
  private readonly values = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

  constructor(app: App, private title: string, private resolve: (value: DurationResult | null) => void) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    const head = this.contentEl.createDiv({ cls: "btl-duration-head" });
    head.createEl("h3", { text: this.title });
    const value = head.createEl("strong", { text: this.label(this.selected) });
    const wheel = this.contentEl.createDiv({ cls: "btl-duration-wheel" });
    for (const minutes of this.values) {
      const button = wheel.createEl("button", { text: this.label(minutes), attr: { type: "button" } });
      button.dataset.minutes = String(minutes);
      button.toggleClass("is-selected", minutes === this.selected);
      button.onclick = () => {
        this.selected = minutes;
        value.setText(this.label(minutes));
        wheel.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === button));
        button.scrollIntoView({ block: "center", behavior: "smooth" });
      };
    }
    wheel.addEventListener("scroll", () => {
      window.clearTimeout(Number(wheel.dataset.timer || 0));
      wheel.dataset.timer = String(window.setTimeout(() => {
        const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
        const closest = [...wheel.querySelectorAll("button")].sort((a, b) =>
          Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) -
          Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center)
        )[0];
        if (closest) closest.click();
      }, 80));
    }, { passive: true });
    const note = this.contentEl.createEl("textarea", {
      cls: "btl-textarea btl-duration-note",
      attr: { placeholder: "备注（可选）", rows: "3", "aria-label": "备注" }
    });
    note.oninput = () => { this.note = note.value; };
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: "记录", cls: "mod-cta" }).onclick = () => {
      this.resolved = true;
      this.resolve({ minutes: this.selected, note: this.note.trim() });
      this.close();
    };
    window.setTimeout(() => wheel.querySelector<HTMLElement>(`[data-minutes="${this.selected}"]`)?.scrollIntoView({ block: "center" }), 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private label(minutes: number): string {
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }
}

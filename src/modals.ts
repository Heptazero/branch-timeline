import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";
import type { ProjectRef } from "./types";

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
  private value = "";
  constructor(app: App, private title: string, private placeholder: string, private resolve: (value: string | null) => void) {
    super(app);
  }
  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    const input = this.contentEl.createEl("input", { cls: "btl-text-input", attr: { placeholder: this.placeholder } });
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

export interface DurationResult { minutes: number; note: string }

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private message: string,
    private confirm: () => void | Promise<void>
  ) { super(app); }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: "删除", cls: "mod-warning" }).onclick = () => {
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
    new Setting(this.contentEl).setName("备注").addText(text => text.onChange(next => { this.note = next; }));
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

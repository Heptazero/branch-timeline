import { App, Modal } from "obsidian";
import type { ProjectTaskEntry, ProjectTaskIndex, ProjectWorkTask } from "./vault/project-tasks";

export interface ProjectWorkResult {
  minutes: number;
  note: string;
  linkTask: boolean;
  task: ProjectWorkTask | null;
}

export class ProjectWorkModal extends Modal {
  private minutes = 30;
  private note = "";
  private linkTask: boolean;
  private task: ProjectWorkTask | null;
  private resolved = false;
  private picker!: HTMLElement;
  private taskButton!: HTMLButtonElement;
  private headingButton!: HTMLButtonElement;
  private submitButton!: HTMLButtonElement;
  private readonly values = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

  constructor(
    app: App,
    private projectName: string,
    private index: ProjectTaskIndex,
    initialLink: boolean,
    previousTaskId: string | undefined,
    private previousHeadingKey: string | undefined,
    private resolve: (result: ProjectWorkResult | null) => void,
    private fixedMinutes?: number,
    initialNote = ""
  ) {
    super(app);
    this.linkTask = initialLink;
    this.note = initialNote;
    const previous = index.tasks.find(entry => entry.id && entry.id === previousTaskId);
    this.task = previous ? { kind: "existing", entry: previous } : null;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal");
    const head = this.contentEl.createDiv({ cls: "btl-duration-head" });
    head.createEl("h3", { text: `${this.fixedMinutes == null ? "记录" : "结束"} · ${this.projectName}` });
    const value = head.createEl("strong", { text: this.durationLabel(this.fixedMinutes ?? this.minutes) });
    const wheel = this.contentEl.createDiv({ cls: "btl-duration-wheel" });
    wheel.toggleClass("is-hidden", this.fixedMinutes != null);
    for (const minutes of this.fixedMinutes == null ? this.values : []) {
      const button = wheel.createEl("button", { text: this.durationLabel(minutes), attr: { type: "button" } });
      button.dataset.minutes = String(minutes);
      button.toggleClass("is-selected", minutes === this.minutes);
      button.onclick = () => {
        this.minutes = minutes;
        value.setText(this.durationLabel(minutes));
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

    const linkRow = this.contentEl.createDiv({ cls: "btl-work-link-row" });
    const toggle = linkRow.createEl("input", { attr: { type: "checkbox", "aria-label": "关联项目任务" } });
    toggle.checked = this.linkTask;
    linkRow.createSpan({ text: "关联任务" });
    toggle.onchange = () => { this.linkTask = toggle.checked; this.renderTaskControls(); this.refreshSubmit(); };
    linkRow.onclick = event => { if (event.target !== toggle) toggle.click(); };
    this.picker = this.contentEl.createDiv({ cls: "btl-work-picker" });
    this.taskButton = this.picker.createEl("button", { cls: "btl-work-choice", attr: { type: "button" } });
    this.taskButton.onclick = () => this.showTaskSearch();
    this.headingButton = this.picker.createEl("button", { cls: "btl-work-choice", attr: { type: "button" } });
    this.headingButton.onclick = () => this.showHeadingSearch();
    const note = this.contentEl.createEl("textarea", {
      cls: "btl-textarea btl-duration-note",
      attr: { placeholder: "备注（可选）", rows: "3", "aria-label": "备注" }
    });
    note.value = this.note;
    note.oninput = () => { this.note = note.value; };
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    this.submitButton = actions.createEl("button", { text: this.fixedMinutes == null ? "记录" : "完成", cls: "mod-cta" });
    this.submitButton.onclick = () => this.submit();
    this.renderTaskControls();
    this.refreshSubmit();
    if (this.fixedMinutes == null) window.setTimeout(() => wheel.querySelector<HTMLElement>(`[data-minutes="${this.minutes}"]`)?.scrollIntoView({ block: "center" }), 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private renderTaskControls(): void {
    this.picker.toggleClass("is-hidden", !this.linkTask);
    this.taskButton.setText(this.task?.kind === "existing" ? this.task.entry.title : this.task?.kind === "new" ? `新建：${this.task.title}` : "选择任务或新建");
    const headingKey = this.task?.kind === "new" ? this.task.headingKey : "";
    const heading = this.index.headings.find(item => item.key === headingKey);
    this.headingButton.setText(heading ? heading.path.join(" / ") : "选择放入的标题");
    this.headingButton.toggleClass("is-hidden", !this.linkTask || this.task?.kind !== "new");
  }

  private showTaskSearch(): void {
    const { input, list } = this.openSearch("搜索未完成任务或输入新任务");
    const render = () => {
      list.empty();
      const query = input.value.trim();
      const matches = this.index.tasks.filter(task => fuzzyMatch(`${task.title} ${task.headingPath.join(" ")}`, query));
      for (const task of matches.slice(0, 40)) {
        const button = list.createEl("button", { cls: "btl-work-option", attr: { type: "button" } });
        button.createSpan({ text: task.title });
        button.createEl("small", { text: task.headingPath.join(" / ") });
        button.onclick = () => this.chooseExistingTask(task, input, list);
      }
      if (query) {
        const button = list.createEl("button", { cls: "btl-work-option", text: `新建“${query}”`, attr: { type: "button" } });
        button.onclick = () => this.chooseNewTask(query, input, list);
      }
      if (!matches.length && !query) list.createDiv({ text: "暂无未完成任务" });
    };
    input.oninput = render;
    input.onkeydown = event => {
      if (event.key === "Escape") { input.remove(); list.remove(); }
      if (event.key === "ArrowDown") { event.preventDefault(); list.querySelector<HTMLButtonElement>("button")?.focus(); }
      if (event.key === "Enter" && input.value.trim()) {
        event.preventDefault();
        const exact = this.index.tasks.find(task => task.title.normalize("NFC").toLowerCase() === input.value.trim().normalize("NFC").toLowerCase());
        if (exact) this.chooseExistingTask(exact, input, list);
        else this.chooseNewTask(input.value.trim(), input, list);
      }
    };
    render();
  }

  private chooseExistingTask(entry: ProjectTaskEntry, input: HTMLInputElement, list: HTMLElement): void {
    this.task = { kind: "existing", entry };
    list.remove(); input.remove(); this.renderTaskControls(); this.refreshSubmit();
  }

  private chooseNewTask(title: string, input: HTMLInputElement, list: HTMLElement): void {
    input.remove(); list.remove();
    const heading = this.index.headings.find(item => item.key === this.previousHeadingKey) ||
      (this.index.headings.length === 1 ? this.index.headings[0] : null);
    this.task = { kind: "new", title, headingKey: heading?.key || "" };
    this.renderTaskControls();
    this.refreshSubmit();
    if (!heading) this.showHeadingSearch();
  }

  private showHeadingSearch(): void {
    const { input, list } = this.openSearch("搜索任务标题");
    const render = () => {
      list.empty();
      const query = input.value.trim();
      const matches = this.index.headings.filter(heading => fuzzyMatch(heading.path.join(" "), query));
      for (const heading of matches) {
        const button = list.createEl("button", { cls: "btl-work-option", attr: { type: "button" } });
        button.style.paddingLeft = `${12 + heading.depth * 16}px`;
        button.setText(heading.title);
        button.title = heading.path.join(" / ");
        button.onclick = () => {
          if (this.task?.kind === "new") this.task.headingKey = heading.key;
          this.previousHeadingKey = heading.key;
          input.remove(); list.remove(); this.renderTaskControls(); this.refreshSubmit();
        };
      }
      if (!matches.length) list.createDiv({ text: this.index.headings.length ? "没有匹配的标题" : "项目笔记没有匹配的任务标题" });
    };
    input.oninput = render;
    input.onkeydown = event => {
      if (event.key === "Escape") { input.remove(); list.remove(); }
      if (event.key === "ArrowDown") { event.preventDefault(); list.querySelector<HTMLButtonElement>("button")?.focus(); }
    };
    render();
  }

  private openSearch(placeholder: string): { input: HTMLInputElement; list: HTMLElement } {
    this.picker.querySelectorAll(".btl-work-search, .btl-work-list").forEach(element => element.remove());
    const input = this.picker.createEl("input", { cls: "btl-text-input btl-work-search", attr: { placeholder, "aria-label": placeholder } });
    const list = this.picker.createDiv({ cls: "btl-work-list" });
    window.setTimeout(() => input.focus(), 0);
    return { input, list };
  }

  private refreshSubmit(): void {
    if (this.submitButton) this.submitButton.disabled = this.linkTask && (!this.task || (this.task.kind === "new" && !this.task.headingKey));
  }

  private submit(): void {
    if (this.linkTask && (!this.task || (this.task.kind === "new" && !this.task.headingKey))) return;
    this.resolved = true;
    this.resolve({ minutes: this.fixedMinutes ?? this.minutes, note: this.note.trim(), linkTask: this.linkTask, task: this.linkTask ? this.task : null });
    this.close();
  }

  private durationLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }
}

function fuzzyMatch(value: string, query: string): boolean {
  if (!query) return true;
  const haystack = value.normalize("NFC").toLowerCase();
  const needle = query.normalize("NFC").toLowerCase();
  if (haystack.includes(needle)) return true;
  let position = 0;
  for (const char of needle) {
    position = haystack.indexOf(char, position);
    if (position < 0) return false;
    position += 1;
  }
  return true;
}

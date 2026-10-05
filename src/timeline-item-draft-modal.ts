import { App, Menu, Modal, Notice } from "obsidian";
import type { ItemMetadataRequirement, ProjectRef } from "./types";
import { fuzzyMatchProjectTask } from "./vault/project-tasks";
import type { ProjectTaskEntry, ProjectTaskIndex, ProjectWorkTask } from "./vault/project-tasks";

export interface TimelineItemDraftResult {
  title: string;
  note: string;
  projectPath: string | null;
  linkTask: boolean;
  task: ProjectWorkTask | null;
}

export interface TimelineItemDraftCopy {
  heading: string;
  titlePlaceholder: string;
  submitLabel: string;
}

export interface TimelineItemTaskOptions {
  loadTasks: (projectPath: string) => Promise<ProjectTaskIndex>;
  previousTaskId: (projectPath: string) => string | undefined;
  previousHeadingKey: (projectPath: string) => string | undefined;
  initialLink: boolean;
}

export class TimelineItemDraftModal extends Modal {
  private titleValue = "";
  private noteValue = "";
  private projectPath: string | null = null;
  private linkTask: boolean;
  private task: ProjectWorkTask | null = null;
  private index: ProjectTaskIndex | null = null;
  private loading = false;
  private loadVersion = 0;
  private resolved = false;
  private readonly copy: TimelineItemDraftCopy;
  private readonly allowTaskLink: boolean;
  private titleInput!: HTMLInputElement;
  private linkLabel!: HTMLLabelElement;
  private linkInput!: HTMLInputElement;
  private suggestions!: HTMLElement;
  private headingButton!: HTMLButtonElement;
  private projectButton!: HTMLButtonElement;
  private submitButton!: HTMLButtonElement;

  constructor(
    app: App,
    private projects: readonly ProjectRef[],
    private metadataRequirement: ItemMetadataRequirement,
    private resolve: (value: TimelineItemDraftResult | null) => void,
    copy?: TimelineItemDraftCopy,
    private taskOptions?: TimelineItemTaskOptions
  ) {
    super(app);
    this.copy = copy || { heading: "添加代办", titlePlaceholder: "代办内容", submitLabel: "添加" };
    this.allowTaskLink = !copy && !!taskOptions;
    this.linkTask = this.allowTaskLink && !!taskOptions?.initialLink;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal", "btl-item-compose");
    this.contentEl.createEl("h3", { text: this.copy.heading });
    const titleRow = this.contentEl.createDiv({ cls: "btl-item-title-row" });
    this.titleInput = titleRow.createEl("input", {
      cls: "btl-text-input",
      attr: { placeholder: this.copy.titlePlaceholder, "aria-label": this.copy.titlePlaceholder }
    });
    this.titleInput.oninput = () => {
      this.titleValue = this.titleInput.value;
      if (this.linkTask) { this.task = null; this.refreshTaskUi(); }
      this.refreshSubmit();
    };
    this.titleInput.onkeydown = event => this.onTitleKeyDown(event);
    this.linkLabel = titleRow.createEl("label", { cls: "btl-item-task-link" });
    this.linkInput = this.linkLabel.createEl("input", { attr: { type: "checkbox", "aria-label": "关联项目任务" } });
    this.linkInput.checked = this.linkTask;
    this.linkLabel.createSpan({ text: "关联任务" });
    this.linkInput.onchange = () => {
      this.linkTask = this.linkInput.checked;
      this.task = null;
      this.loadVersion += 1;
      if (this.linkTask && this.projectPath) void this.loadProjectTasks(this.projectPath);
      else this.refreshTaskUi();
    };
    this.suggestions = this.contentEl.createDiv({ cls: "btl-item-task-suggestions" });
    this.headingButton = this.contentEl.createEl("button", { cls: "btl-work-choice btl-item-task-heading", attr: { type: "button" } });
    this.headingButton.onclick = () => this.showHeadingSearch();
    const note = this.contentEl.createEl("textarea", {
      cls: "btl-textarea btl-item-compose-note",
      attr: { placeholder: "备注（可选）", rows: "4", "aria-label": "备注" }
    });
    note.oninput = () => { this.noteValue = note.value; };
    const selectors = this.contentEl.createDiv({ cls: "btl-item-compose-selectors" });
    this.projectButton = selectors.createEl("button", { attr: { type: "button" } });
    this.projectButton.onclick = event => this.openProjectMenu(event);
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    this.submitButton = actions.createEl("button", { text: this.copy.submitLabel, cls: "mod-cta" });
    this.submitButton.onclick = () => this.submit();
    this.refreshSelectors();
    this.refreshTaskUi();
    window.setTimeout(() => this.titleInput.focus(), 30);
  }

  onClose(): void {
    this.loadVersion += 1;
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private openProjectMenu(event: MouseEvent): void {
    const menu = new Menu();
    if (!this.requiresProject()) {
      menu.addItem(item => item.setTitle("无项目").setChecked(!this.projectPath).onClick(() => this.selectProject(null)));
      menu.addSeparator();
    }
    if (!this.projects.length) menu.addItem(item => item.setTitle("没有进行中的项目").setDisabled(true));
    for (const project of this.projects) {
      menu.addItem(item => item.setTitle(project.name).setChecked(this.projectPath === project.path).onClick(() => this.selectProject(project.path)));
    }
    menu.showAtMouseEvent(event);
  }

  private selectProject(path: string | null): void {
    if (this.projectPath === path) return;
    this.projectPath = path;
    this.task = null;
    this.index = null;
    this.loadVersion += 1;
    this.refreshSelectors();
    if (path && this.linkTask) void this.loadProjectTasks(path);
    else this.refreshTaskUi();
  }

  private async loadProjectTasks(path: string): Promise<void> {
    const version = ++this.loadVersion;
    this.loading = true;
    this.index = null;
    this.refreshTaskUi();
    try {
      const index = await this.taskOptions!.loadTasks(path);
      if (version !== this.loadVersion || this.projectPath !== path) return;
      this.index = index;
      const previousId = this.taskOptions?.previousTaskId(path);
      const previous = previousId ? index.tasks.find(entry => entry.id === previousId) : undefined;
      if (!this.titleValue.trim() && previous) this.chooseExisting(previous);
    } catch (error) {
      if (version !== this.loadVersion) return;
      new Notice(error instanceof Error ? error.message : "项目任务读取失败");
    } finally {
      if (version === this.loadVersion) { this.loading = false; this.refreshTaskUi(); }
    }
  }

  private onTitleKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" && this.linkTask && this.projectPath) {
      const first = this.suggestions.querySelector<HTMLButtonElement>("button");
      if (first) { event.preventDefault(); first.focus(); }
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!this.linkTask || !this.projectPath) { this.submit(); return; }
    if (this.task) { this.submit(); return; }
    const query = this.titleValue.trim();
    if (!query || !this.index) return;
    const exact = this.index.tasks.find(entry => entry.title.normalize("NFC").toLowerCase() === query.normalize("NFC").toLowerCase());
    const first = this.index.tasks.find(entry => fuzzyMatchProjectTask(`${entry.title} ${entry.headingPath.join(" ")}`, query));
    if (exact || first) this.chooseExisting((exact || first)!);
    else this.chooseNew(query);
  }

  private chooseExisting(entry: ProjectTaskEntry): void {
    this.task = { kind: "existing", entry };
    this.titleValue = entry.title;
    this.titleInput.value = entry.title;
    this.refreshTaskUi();
  }

  private chooseNew(title: string): void {
    if (!this.index || !this.projectPath) return;
    const previous = this.taskOptions?.previousHeadingKey(this.projectPath);
    const heading = this.index.headings.find(item => item.key === previous)
      || (this.index.headings.length === 1 ? this.index.headings[0] : null);
    this.task = { kind: "new", title, headingKey: heading?.key || "" };
    this.titleValue = title;
    this.titleInput.value = title;
    this.refreshTaskUi();
    if (!heading) this.showHeadingSearch();
  }

  private renderTaskList(): void {
    this.suggestions.empty();
    if (!this.allowTaskLink || !this.projectPath || !this.linkTask || this.task) return;
    if (this.loading) { this.suggestions.createDiv({ text: "读取任务中…" }); return; }
    if (!this.index) return;
    const query = this.titleValue.trim();
    const matches = this.index.tasks.filter(entry => fuzzyMatchProjectTask(`${entry.title} ${entry.headingPath.join(" ")}`, query));
    for (const entry of matches.slice(0, 30)) {
      const button = this.suggestions.createEl("button", { cls: "btl-work-option", attr: { type: "button" } });
      button.createSpan({ text: entry.title });
      button.createEl("small", { text: entry.headingPath.join(" / ") });
      button.onclick = () => this.chooseExisting(entry);
    }
    if (query) this.suggestions.createEl("button", { cls: "btl-work-option", text: `新建“${query}”`, attr: { type: "button" } })
      .onclick = () => this.chooseNew(query);
    else if (!matches.length) this.suggestions.createDiv({ text: "暂无未完成任务" });
  }

  private showHeadingSearch(): void {
    if (this.task?.kind !== "new" || !this.index) return;
    this.suggestions.empty();
    this.suggestions.removeClass("is-hidden");
    const input = this.suggestions.createEl("input", { cls: "btl-text-input btl-work-search", attr: { placeholder: "搜索任务标题", "aria-label": "搜索任务标题" } });
    const list = this.suggestions.createDiv({ cls: "btl-work-list" });
    const render = (): void => {
      list.empty();
      const headings = this.index!.headings.filter(item => fuzzyMatchProjectTask(item.path.join(" "), input.value.trim()));
      for (const heading of headings) {
        const button = list.createEl("button", { cls: "btl-work-option", text: heading.title, attr: { type: "button", title: heading.path.join(" / ") } });
        button.style.paddingLeft = `${12 + heading.depth * 16}px`;
        button.onclick = () => {
          if (this.task?.kind === "new") this.task.headingKey = heading.key;
          this.refreshTaskUi();
        };
      }
      if (!headings.length) list.createDiv({ text: "没有匹配的标题" });
    };
    input.oninput = render;
    input.onkeydown = event => { if (event.key === "Escape") this.refreshTaskUi(); };
    render();
    window.setTimeout(() => input.focus(), 0);
  }

  private refreshTaskUi(): void {
    if (!this.linkLabel) return;
    const visible = this.allowTaskLink && !!this.projectPath;
    this.linkLabel.toggleClass("is-hidden", !visible);
    this.linkInput.checked = visible && this.linkTask;
    this.titleInput.placeholder = visible && this.linkTask ? "搜索未完成任务或输入新任务" : this.copy.titlePlaceholder;
    const headingKey = this.task?.kind === "new" ? this.task.headingKey : "";
    const heading = this.index?.headings.find(item => item.key === headingKey);
    this.headingButton.toggleClass("is-hidden", !visible || !this.linkTask || this.task?.kind !== "new");
    this.headingButton.setText(heading ? heading.path.join(" / ") : "选择任务标题");
    this.suggestions.toggleClass("is-hidden", !visible || !this.linkTask || !!this.task);
    this.renderTaskList();
    this.refreshSubmit();
  }

  private refreshSelectors(): void {
    const project = this.projects.find(item => item.path === this.projectPath);
    this.projectButton.setText(project ? `@${project.name}` : "选择项目");
    this.projectButton.toggleClass("is-selected", !!project);
    this.projectButton.style.setProperty("--btl-choice-color", project?.color || "var(--interactive-accent)");
  }

  private refreshSubmit(): void {
    if (!this.submitButton) return;
    const linked = this.allowTaskLink && this.linkTask && !!this.projectPath;
    this.submitButton.disabled = !this.titleValue.trim() || (this.requiresProject() && !this.projectPath)
      || (linked && (!this.task || (this.task.kind === "new" && !this.task.headingKey)));
  }

  private submit(): void {
    this.refreshSubmit();
    if (this.submitButton.disabled) return;
    const linked = this.allowTaskLink && this.linkTask && !!this.projectPath;
    this.resolved = true;
    this.resolve({ title: this.titleValue.trim(), note: this.noteValue.trim(), projectPath: this.projectPath,
      linkTask: linked, task: linked ? this.task : null });
    this.close();
  }

  private requiresProject(): boolean {
    return this.metadataRequirement === "project" || this.metadataRequirement === "both";
  }
}

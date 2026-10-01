import { Menu, setIcon } from "obsidian";
import type { BranchTimelineState, ProjectRef, ProjectTypeConfig } from "../types";
import { installLongPressSort } from "../interactions/long-press-sort";
import { projectTimeSummary, type ProjectTimeScope, type ProjectTimeSummary } from "./project-time";

interface ProjectGroup {
  label: string;
  matches: (status: string) => boolean;
}

export interface ProjectsPageOptions {
  container: HTMLElement;
  projects: readonly ProjectRef[];
  state: BranchTimelineState;
  projectOrder: readonly string[];
  projectTypes: readonly ProjectTypeConfig[];
  pinnedProjects: readonly string[];
  collapsedGroups: readonly string[];
  focusDate: Date;
  timeScope: ProjectTimeScope;
  openProject: (path: string) => void;
  openProjectFile: (path: string) => void;
  onTimeScope: (scope: ProjectTimeScope) => void;
  onSetDailyPlan: (path: string, anchor: HTMLElement) => void;
  onTogglePin: (path: string) => void;
  onToggleGroup: (label: string) => void;
  onReorder: (paths: string[]) => void;
}

const PROJECT_GROUPS: readonly ProjectGroup[] = [
  { label: "进行中", matches: status => ["active", "doing", "进行中"].includes(status) },
  { label: "计划", matches: status => ["todo", "plan", "planned", "计划", ""].includes(status) },
  { label: "搁置", matches: status => ["hold", "paused", "搁置"].includes(status) },
  { label: "归档", matches: status => ["done", "archived", "archive", "归档"].includes(status) }
];

export function renderProjectsPage(
  options: ProjectsPageOptions
): void {
  const { container, projects } = options;
  if (!projects.length) {
    container.createDiv({ cls: "btl-empty", text: "暂无项目" });
    return;
  }
  renderTimeScope(options);

  const assigned = new Set<string>();
  for (const group of PROJECT_GROUPS) {
    const entries = projects.filter(project => group.matches(project.status));
    if (!entries.length) continue;
    entries.forEach(project => assigned.add(project.path));
    renderProjectSection(options, group.label, sortProjects(entries, options));
  }

  const other = projects.filter(project => !assigned.has(project.path));
  if (other.length) renderProjectSection(options, "其他", sortProjects(other, options));
}

function renderTimeScope(options: ProjectsPageOptions): void {
  const control = options.container.createDiv({ cls: "btl-project-scope btl-setting-segments" });
  for (const choice of [
    { id: "day" as const, label: "今日" },
    { id: "week" as const, label: "本周" },
    { id: "total" as const, label: "总计" }
  ]) {
    const button = control.createEl("button", {
      text: choice.label,
      cls: choice.id === options.timeScope ? "is-active" : "",
      attr: { type: "button", "aria-pressed": String(choice.id === options.timeScope) }
    });
    button.onclick = () => { if (choice.id !== options.timeScope) options.onTimeScope(choice.id); };
  }
}

function sortProjects(projects: readonly ProjectRef[], options: ProjectsPageOptions): ProjectRef[] {
  const pinned = new Set(options.pinnedProjects);
  const rank = new Map(options.projectOrder.map((path, index) => [path, index]));
  const typeRank = new Map(options.projectTypes.map((item, index) => [item.type.trim().toLowerCase(), index]));
  return [...projects].sort((a, b) => {
    const type = (typeRank.get(a.type.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) - (typeRank.get(b.type.toLowerCase()) ?? Number.MAX_SAFE_INTEGER);
    if (type) return type;
    const pin = Number(pinned.has(b.path)) - Number(pinned.has(a.path));
    if (pin) return pin;
    return (rank.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.path) ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name, "zh-CN");
  });
}

function renderProjectSection(
  options: ProjectsPageOptions,
  label: string,
  projects: readonly ProjectRef[]
): void {
  const section = options.container.createDiv({ cls: "btl-project-section" });
  const collapsed = options.collapsedGroups.includes(label);
  const header = section.createEl("button", {
    cls: "btl-project-section-head",
    attr: { "aria-expanded": String(!collapsed) }
  });
  const chevron = header.createSpan();
  setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
  header.createEl("h3", { text: label });
  header.onclick = () => options.onToggleGroup(label);
  if (collapsed) return;

  const grid = section.createDiv({ cls: "btl-project-grid", attr: { "data-project-group": label } });
  for (const project of projects) {
    const pinned = options.pinnedProjects.includes(project.path);
    const card = grid.createDiv({
      cls: `btl-project-card${pinned ? " is-pinned" : ""}`,
      attr: { role: "button", tabindex: "0", "data-project-path": project.path }
    });
    if (project.color) card.style.setProperty("--btl-project-color", project.color);
    const title = card.createSpan({ cls: "btl-project-card-title", text: project.name });
    if (pinned) {
      const pin = title.createSpan({ cls: "btl-project-pin" });
      setIcon(pin, "pin");
    }
    const summary = projectTimeSummary(options.state, project.path, options.focusDate, options.timeScope, currentLogicalMinute());
    renderProjectTime(card, project, summary, options);
    const more = card.createEl("button", { cls: "btl-project-card-menu", text: "⋮", attr: { "aria-label": "项目菜单" } });
    more.onclick = event => {
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem(item => item
        .setTitle("打开项目文件")
        .setIcon("file-text")
        .onClick(() => options.openProjectFile(project.path)));
      menu.addSeparator();
      menu.addItem(item => item
        .setTitle(pinned ? "取消置顶" : "置顶")
        .setIcon(pinned ? "pin-off" : "pin")
        .onClick(() => options.onTogglePin(project.path)));
      menu.showAtMouseEvent(event);
    };
    card.onclick = event => {
      if (card.dataset.suppressClick === "true" || (event.target as HTMLElement).closest("button")) return;
      options.openProject(project.path);
    };
    card.onkeydown = event => {
      if ((event.target as HTMLElement).closest("button")) return;
      if (event.key === "Enter" || event.key === " ") options.openProject(project.path);
    };
  }
  installLongPressSort(grid, {
    itemSelector: ".btl-project-card",
    idAttribute: "data-project-path",
    onOrder: options.onReorder
  });
}

function renderProjectTime(
  card: HTMLElement,
  project: ProjectRef,
  summary: ProjectTimeSummary,
  options: ProjectsPageOptions
): void {
  if (options.timeScope === "total") {
    card.createSpan({ cls: "btl-project-card-duration", text: durationLabel(summary.actual) });
    return;
  }
  const metric = card.createEl(options.timeScope === "day" ? "button" : "div", {
    cls: "btl-project-time",
    attr: options.timeScope === "day"
      ? { type: "button", "aria-label": `设置${project.name}今日计划时间` }
      : undefined
  });
  const row = metric.createDiv({ cls: "btl-project-time-row" });
  row.createEl("strong", { text: durationLabel(summary.actual) });
  row.createSpan({ text: summary.planned ? `/ ${durationLabel(summary.planned)}` : options.timeScope === "day" ? "/ 设置" : "" });
  const progress = metric.createDiv({ cls: "btl-project-time-progress" });
  progress.createDiv({ cls: "btl-project-time-fill" }).style.width = `${summary.planned ? Math.min(100, summary.actual / summary.planned * 100) : 0}%`;
  if (options.timeScope === "week") {
    const days = metric.createDiv({ cls: "btl-project-week" });
    for (const day of summary.days) {
      const level = day.planned ? Math.min(1, day.actual / day.planned) : day.actual ? 1 : 0;
      const bar = days.createSpan({ attr: { title: `${day.date} · ${durationLabel(day.actual)}${day.planned ? ` / ${durationLabel(day.planned)}` : ""}` } });
      bar.style.setProperty("--btl-project-day-level", String(level));
    }
  }
  if (options.timeScope === "day") {
    metric.onclick = event => {
      event.stopPropagation();
      options.onSetDailyPlan(project.path, metric);
    };
  }
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(minutes % 60 ? 1 : 0)}h`;
}

function currentLogicalMinute(): number {
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  return minute + (now.getHours() < 2 ? 1440 : 0);
}

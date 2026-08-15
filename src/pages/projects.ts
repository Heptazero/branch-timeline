import { Menu, setIcon } from "obsidian";
import { itemDuration } from "../timeline/model";
import type { BranchTimelineState, ProjectRef } from "../types";
import { installLongPressSort } from "../interactions/long-press-sort";

interface ProjectGroup {
  label: string;
  matches: (status: string) => boolean;
}

export interface ProjectsPageOptions {
  container: HTMLElement;
  projects: readonly ProjectRef[];
  state: BranchTimelineState;
  projectOrder: readonly string[];
  pinnedProjects: readonly string[];
  collapsedGroups: readonly string[];
  openProject: (path: string) => void;
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

function sortProjects(projects: readonly ProjectRef[], options: ProjectsPageOptions): ProjectRef[] {
  const pinned = new Set(options.pinnedProjects);
  const rank = new Map(options.projectOrder.map((path, index) => [path, index]));
  return [...projects].sort((a, b) => {
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
    card.createSpan({ cls: "btl-project-card-duration", text: durationLabel(projectMinutes(options.state, project.path)) });
    const more = card.createEl("button", { cls: "btl-project-card-menu", text: "⋮", attr: { "aria-label": "项目菜单" } });
    more.onclick = event => {
      event.stopPropagation();
      const menu = new Menu();
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
      if (event.key === "Enter" || event.key === " ") options.openProject(project.path);
    };
  }
  installLongPressSort(grid, {
    itemSelector: ".btl-project-card",
    idAttribute: "data-project-path",
    onOrder: options.onReorder
  });
}

function projectMinutes(state: BranchTimelineState, path: string): number {
  let minutes = 0;
  for (const day of Object.values(state.days)) {
    for (const item of day.items) {
      if (item.projectPath === path && item.kind === "fact") minutes += itemDuration(item, day.wake);
    }
  }
  return minutes;
}

function durationLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(minutes % 60 ? 1 : 0)}h`;
}

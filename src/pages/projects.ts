import { Menu, setIcon } from "obsidian";
import type { BranchTimelineState, ProjectRef, ProjectTypeConfig } from "../types";
import { installLongPressSort } from "../interactions/long-press-sort";
import { scopeExpectedFraction } from "./project-goals";
import { PROJECT_FILTERS, PROJECT_SORTS, projectHours, projectStatusGroup, sortProjectEntries,
  type SortDirection } from "./project-list-model";
import { renderProjectProgressRow } from "./project-progress-row";
import { projectTimeSummary, type ProjectTimeScope } from "./project-time";
import { renderProjectDonut } from "./project-donut";

export interface ProjectsPageOptions {
  container: HTMLElement;
  projects: readonly ProjectRef[];
  state: BranchTimelineState;
  projectOrder: readonly string[];
  projectTypes: readonly ProjectTypeConfig[];
  pinnedProjects: readonly string[];
  focusDate: Date;
  timeScope: ProjectTimeScope;
  openProject: (path: string) => void;
  openProjectFile: (path: string) => void;
  onTimeScope: (scope: ProjectTimeScope) => void;
  onSetPlan: (path: string, scope: "day" | "week", anchor: HTMLElement) => void;
  onTogglePin: (path: string) => void;
  onReorder: (paths: string[]) => void;
}

const SCOPE_LABELS = { day: "今日", week: "本周", total: "总计" };

export function renderProjectsPage(options: ProjectsPageOptions): { destroy: () => void; update: () => void } {
  const root = options.container.createDiv({ cls: "btl-project-overview" });
  const controls = root.createDiv({ cls: "btl-project-controls" });
  const summary = root.createDiv({ cls: "btl-project-summary" });
  const chart = root.createDiv({ cls: "btl-project-chart" });
  const list = root.createDiv({ cls: "btl-project-list" });
  let cleanup: (() => void) | undefined;
  let filter = readChoice("filter", PROJECT_FILTERS, "active");
  let sort = readChoice("sort", PROJECT_SORTS, "duration");
  let direction: SortDirection = localStorage.getItem("branch-timeline-hz-project-direction") === "asc" ? "asc" : "desc";
  let showChart = localStorage.getItem("branch-timeline-hz-project-chart") !== "hidden";
  let now = new Date();
  let entries = projectEntries();
  const scope = controlButton(controls, SCOPE_LABELS[options.timeScope]);
  scope.onclick = () => {
    const menu = new Menu();
    for (const id of ["day", "week", "total"] as const) menu.addItem(item => item.setTitle(SCOPE_LABELS[id]).setChecked(id === options.timeScope)
      .onClick(() => { if (id !== options.timeScope) options.onTimeScope(id); }));
    showMenu(menu, scope);
  };
  const status = controlButton(controls, PROJECT_FILTERS.find(choice => choice.id === filter)!.label);
  status.onclick = () => {
    const menu = new Menu();
    for (const choice of PROJECT_FILTERS) menu.addItem(item => item.setTitle(choice.label).setChecked(choice.id === filter).onClick(() => {
      filter = choice.id;
      localStorage.setItem("branch-timeline-hz-project-filter", filter);
      status.setText(`${choice.label} ⌄`);
      draw();
    }));
    showMenu(menu, status);
  };
  const order = controlButton(controls, "", "btl-project-order");
  order.onclick = () => {
    const menu = new Menu();
    for (const choice of PROJECT_SORTS) menu.addItem(item => item.setTitle(choice.label).setChecked(choice.id === sort).onClick(() => {
      sort = choice.id;
      localStorage.setItem("branch-timeline-hz-project-sort", sort);
      draw();
    }));
    if (sort !== "manual") {
      menu.addSeparator();
      for (const choice of [{ id: "desc" as const, label: "降序 ↓" }, { id: "asc" as const, label: "升序 ↑" }]) {
        menu.addItem(item => item.setTitle(choice.label).setChecked(direction === choice.id).onClick(() => {
          direction = choice.id;
          localStorage.setItem("branch-timeline-hz-project-direction", direction);
          draw();
        }));
      }
    }
    showMenu(menu, order);
  };
  draw();
  return { destroy: () => cleanup?.(), update: () => {
    const active = root.ownerDocument.activeElement;
    const keyboardFocus = active?.matches(":focus-visible") && (summary.contains(active) || list.contains(active));
    if (keyboardFocus || list.querySelector(".is-sorting, [data-menu-open]") || chart.contains(active) || root.ownerDocument.querySelector(".btl-project-goal-popover")) return;
    now = new Date();
    entries = projectEntries();
    draw();
  } };

  function projectEntries() {
    const minute = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
    return options.projects.map(project => ({ project, summary: projectTimeSummary(options.state, project.path, options.focusDate, options.timeScope, minute) }));
  }

  function draw(): void {
    cleanup?.();
    cleanup = undefined;
    list.empty();
    summary.empty();
    order.setText(`${PROJECT_SORTS.find(choice => choice.id === sort)!.label}${sort === "manual" ? " ⌄" : direction === "desc" ? " ↓" : " ↑"}`);
    const visible = entries.filter(entry => filter === "all" || projectStatusGroup(entry.project.status) === filter);
    const sorted = sortProjectEntries(visible, sort, direction, options.pinnedProjects, options.projectOrder, options.projectTypes);
    const totalLabel = options.timeScope === "total" ? "总计" : `${SCOPE_LABELS[options.timeScope]}总计`;
    const text = summary.createDiv({ cls: "btl-project-summary-text" });
    text.createSpan({ text: showChart ? "时长占比" : totalLabel });
    if (!showChart) text.createEl("strong", { text: projectHours(visible.reduce((sum, entry) => sum + entry.summary.actual, 0)) });
    const toggle = summary.createEl("button", { cls: "btl-project-chart-toggle", attr: {
      type: "button", "aria-pressed": String(showChart), "aria-label": showChart ? "隐藏时长占比图" : "显示时长占比图",
      title: showChart ? "隐藏时长占比图" : "显示时长占比图"
    } });
    setIcon(toggle, "chart-pie");
    toggle.onclick = () => {
      showChart = !showChart;
      localStorage.setItem("branch-timeline-hz-project-chart", showChart ? "visible" : "hidden");
      draw();
      summary.querySelector<HTMLButtonElement>(".btl-project-chart-toggle")?.focus({ preventScroll: true });
    };
    chart.empty();
    chart.hidden = !showChart;
    if (showChart) renderProjectDonut(chart, visible, totalLabel);
    if (!sorted.length) { list.createDiv({ cls: "btl-project-list-empty", text: "暂无项目" }); return; }
    const maximum = Math.max(1, ...sorted.map(entry => entry.summary.actual));
    const expected = scopeExpectedFraction(options.focusDate, options.timeScope, now);
    const groups = sort === "manual" ? [
      sorted.filter(entry => options.pinnedProjects.includes(entry.project.path)),
      sorted.filter(entry => !options.pinnedProjects.includes(entry.project.path))
    ] : [sorted];
    const cleanups: Array<() => void> = [];
    for (const entries of groups.filter(group => group.length)) {
      const group = list.createDiv({ cls: "btl-project-sort-group" });
      for (const entry of entries) renderProjectProgressRow(group, entry, {
        scope: options.timeScope, expected, maximum, manual: sort === "manual",
        pinned: options.pinnedProjects.includes(entry.project.path), open: options.openProject,
        openFile: options.openProjectFile, setPlan: options.onSetPlan, togglePin: options.onTogglePin
      });
      if (sort === "manual") cleanups.push(installLongPressSort(group, {
        itemSelector: ".btl-progress-row", idAttribute: "data-project-path", handleSelector: ".btl-progress-drag", axis: "vertical", onOrder: options.onReorder
      }));
    }
    cleanup = () => cleanups.forEach(stop => stop());
  }
}

function controlButton(parent: HTMLElement, text: string, extra = ""): HTMLButtonElement {
  return parent.createEl("button", { cls: `btl-overview-control ${extra}`, text: text ? `${text} ⌄` : "", attr: { type: "button", "aria-haspopup": "menu" } });
}

function showMenu(menu: Menu, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
}

function readChoice<T extends string>(key: string, choices: readonly { id: T }[], fallback: T): T {
  const saved = localStorage.getItem(`branch-timeline-hz-project-${key}`);
  return choices.find(choice => choice.id === saved)?.id || fallback;
}

import { Menu, setIcon } from "obsidian";
import type { BranchTimelineState, ProjectRef } from "../types";
import { nowOnAxis } from "./focus-stats";
import { focusHours, focusSample } from "./focus-comparison";
import { renderFocusChart } from "./focus-chart";
import { renderTimeMap } from "./time-map";
import { renderSleepSummary } from "./sleep-summary";
import { policyProgress } from "./policy-progress";
import { dateKey, logicalToday } from "../vault/format";
import { startOfWeek } from "./navigation";
import { restoreStatsNavigation, selectStatsView, STATS_VIEWS, toggleStatsTimeMap } from "./stats-navigation";

export interface StatsPageOptions {
  container: HTMLElement;
  date: Date;
  state: BranchTimelineState;
  projects: readonly ProjectRef[];
  onOpenDate: (date: Date) => void;
  onOpenProject: (path: string) => void;
  onOpenPolicy: () => void;
}

export function renderStatsPage(options: StatsPageOptions): void {
  const start = startOfWeek(options.date);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const dashboard = options.container.createDiv({ cls: "btl-stats-dashboard btl-summary-dashboard" });
  const toolbar = dashboard.createDiv({ cls: "btl-summary-toolbar" });
  const choose = toolbar.createEl("button", { cls: "btl-summary-select btl-summary-view", attr: { type: "button", "aria-label": "切换统计视图" } });
  const tools = toolbar.createDiv({ cls: "btl-summary-tools" });
  const summary = dashboard.createDiv({ cls: "btl-summary-total" });
  const today = dateKey(logicalToday());
  const first = dateKey(dates[0]);
  const last = dateKey(dates[dates.length - 1]);
  const weekly = focusSample(options.state.days, key => key >= first && key <= last, today, nowOnAxis());
  summary.createSpan({ text: "本周总计" });
  summary.createEl("strong", { text: focusHours(weekly.minutes) });
  let navigation = restoreStatsNavigation(localStorage.getItem("branch-timeline-hz-stats-view"),
    localStorage.getItem("branch-timeline-hz-stats-return-view"));
  const sleepSummary = renderSleepSummary(dashboard, dates, options.state, () => {
    navigation = toggleStatsTimeMap(navigation);
    saveAndDraw();
  });
  const content = dashboard.createDiv({ cls: "btl-summary-content" });
  choose.onclick = event => {
    event.stopPropagation();
    const menu = new Menu();
    for (const option of STATS_VIEWS) menu.addItem(item => item.setTitle(option.label).setChecked(navigation.view === option.id).onClick(() => {
      navigation = selectStatsView(navigation, option.id);
      saveAndDraw();
    }));
    const rect = choose.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  };
  draw();

  function saveAndDraw(): void {
    localStorage.setItem("branch-timeline-hz-stats-view", navigation.view);
    localStorage.setItem("branch-timeline-hz-stats-return-view", navigation.returnView);
    draw();
  }

  function draw(): void {
    const view = navigation.view;
    sleepSummary.setTimeMapExpanded(view === "time");
    choose.empty();
    choose.createSpan({ text: STATS_VIEWS.find(option => option.id === view)!.label });
    setIcon(choose.createSpan(), "chevron-down");
    content.empty();
    tools.empty();
    if (view === "project" || view === "day") {
      renderFocusChart({ container: content, controls: tools, mode: view, dates, state: options.state,
        projects: options.projects, onOpenDate: options.onOpenDate, onOpenProject: options.onOpenProject });
    } else if (view === "time") renderTimeMap(content, { dates, selected: options.date, state: options.state,
      projects: options.projects, onOpenDate: options.onOpenDate });
    else renderAnchorCard(content, dates, options.state, options.onOpenPolicy);
  }
}

function renderAnchorCard(dashboard: HTMLElement, dates: readonly Date[], state: BranchTimelineState, onOpenPolicy: () => void): void {
  const card = dashboard.createDiv({ cls: "btl-summary-anchors" });
  const events = state.policyEvents;
  const start = dateKey(dates[0]);
  const end = dateKey(dates[dates.length - 1]);
  const today = dateKey(logicalToday());
  const anchors = state.policyCards.filter(card => !card.deletedDate).slice(0, 12);
  if (!anchors.length) {
    card.createDiv({ cls: "btl-stats-empty", text: "暂无锚点" });
    return;
  }
  const list = card.createDiv({ cls: "btl-anchor-stats" });
  for (const anchor of anchors) {
    const progress = policyProgress(anchor, events, end, today);
    const weekEvents = events.filter(event => event.cardId === anchor.id && event.date >= start && event.date <= end);
    const success = weekEvents.filter(event => event.result !== "violation").length;
    const violations = weekEvents.filter(event => event.result === "violation").length;
    const row = list.createEl("button", { cls: "btl-anchor-stat-row", attr: { type: "button", "aria-label": "查看锚点 " + anchor.name } });
    row.onclick = onOpenPolicy;
    row.createSpan({ cls: "btl-anchor-stat-name", text: anchor.name });
    row.createEl("small", { text: "✓ " + success + "  × " + violations });
    row.createEl("strong", { text: progress.count ? String(progress.count) : "–" });
  }
}

import type { BranchTimelineState, ProjectRef } from "../types";
import { distractionWeight } from "../focus-events";
import { dateKey, logicalToday } from "../vault/format";
import { burdenLabel, burdenRate, nowOnAxis, periodAtMinute, periodMinutes, projectFocusTotal, recordedMinutes, type DayPeriod, type FocusTotal } from "./focus-stats";

type Mode = "day" | "period" | "project";
type Row = { label: string; total: FocusTotal; color?: string; open?: () => void };

export interface FocusChartOptions {
  container: HTMLElement;
  dates: readonly Date[];
  state: BranchTimelineState;
  projects: readonly ProjectRef[];
  onOpenDate: (date: Date) => void;
  onOpenProject: (path: string) => void;
}

export function renderFocusChart(options: FocusChartOptions): void {
  const card = options.container.createDiv({ cls: "btl-stats-card" });
  const head = card.createDiv({ cls: "btl-stats-card-head" });
  head.createEl("strong", { text: "走神负担" });
  const scope = head.createEl("small");
  const control = card.createDiv({ cls: "btl-focus-switch btl-setting-segments" });
  const plot = card.createDiv();
  let mode = readMode();
  const buttons: HTMLButtonElement[] = [];
  for (const [id, label] of [["day", "每日"], ["period", "时段"], ["project", "项目"]] as const) {
    const button = control.createEl("button", { text: label, attr: { type: "button" } });
    buttons.push(button);
    button.onclick = () => {
      mode = id;
      localStorage.setItem("branch-timeline-hz-focus-mode", id);
      update();
    };
  }
  update();

  function update(): void {
    buttons.forEach((button, index) => {
      const selected = ["day", "period", "project"][index] === mode;
      button.toggleClass("is-active", selected);
      button.setAttr("aria-pressed", String(selected));
    });
    scope.setText(mode === "project" ? "累计" : rangeLabel(options.dates));
    plot.empty();
    const rows = mode === "project" ? projectRows(options) : mode === "period" ? periodRows(options) : dayRows(options);
    if (!rows.some(row => row.total.minutes || row.total.load || row.total.good)) {
      plot.createDiv({ cls: "btl-stats-empty", text: "暂无记录" });
      return;
    }
    const max = Math.max(1, ...rows.map(row => burdenRate(row.total)));
    if (mode === "project") drawProjectBars(plot, rows, max);
    else drawVerticalBars(plot, rows, max);
  }
}

function dayRows(options: FocusChartOptions): Row[] {
  const today = dateKey(logicalToday());
  const now = nowOnAxis();
  return options.dates.map(date => {
    const key = dateKey(date);
    const day = options.state.days[key];
    return {
      label: `${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}${date.getDate()}`,
      total: {
        minutes: day ? recordedMinutes(day, key === today ? now : undefined) : 0,
        distractions: day?.distractions?.length || 0,
        load: day?.distractions?.reduce((sum, event) => sum + distractionWeight(event), 0) || 0,
        good: day?.goodStates?.length || 0
      },
      open: () => options.onOpenDate(date)
    };
  });
}

function periodRows(options: FocusChartOptions): Row[] {
  const today = dateKey(logicalToday());
  const now = nowOnAxis();
  const totals: Record<DayPeriod, FocusTotal> = {
    morning: { minutes: 0, distractions: 0, load: 0, good: 0 },
    afternoon: { minutes: 0, distractions: 0, load: 0, good: 0 },
    evening: { minutes: 0, distractions: 0, load: 0, good: 0 }
  };
  for (const date of options.dates) {
    const key = dateKey(date);
    const day = options.state.days[key];
    if (!day) continue;
    const minutes = periodMinutes(day, key === today ? now : undefined);
    for (const period of Object.keys(totals) as DayPeriod[]) totals[period].minutes += minutes[period];
    for (const event of day.distractions || []) {
      const total = totals[periodAtMinute(event.minute)];
      total.distractions++;
      total.load += distractionWeight(event);
    }
    for (const event of day.goodStates || []) totals[periodAtMinute(event.minute)].good++;
  }
  return [["morning", "上午"], ["afternoon", "下午"], ["evening", "晚上"]].map(([period, label]) => ({ label, total: totals[period as DayPeriod] }));
}

function projectRows(options: FocusChartOptions): Row[] {
  const today = dateKey(logicalToday());
  const now = nowOnAxis();
  return options.projects.map(project => ({
    label: project.name,
    total: projectFocusTotal(options.state, project.path, today, now),
    color: project.color,
    open: () => options.onOpenProject(project.path)
  })).filter(row => row.total.minutes || row.total.load || row.total.good)
    .sort((a, b) => b.total.minutes - a.total.minutes);
}

function drawVerticalBars(plot: HTMLElement, rows: readonly Row[], max: number): void {
  const chart = plot.createDiv({ cls: "btl-focus-bars" });
  chart.style.setProperty("--focus-columns", String(rows.length));
  for (const row of rows) {
    const value = burdenRate(row.total);
    const item = row.open
      ? chart.createEl("button", { cls: "btl-focus-bar-item", attr: { type: "button", "aria-label": description(row) } })
      : chart.createDiv({ cls: "btl-focus-bar-item" });
    item.setAttr("title", description(row));
    if (row.open) item.onclick = row.open;
    item.createEl("strong", { text: burdenLabel(row.total) });
    const track = item.createSpan({ cls: "btl-focus-bar-track" });
    const fill = track.createSpan({ cls: "btl-focus-bar-fill" });
    fill.style.height = `${row.total.load ? Math.max(3, Math.min(100, value / max * 100)) : 0}%`;
    item.createEl("small", { text: row.label });
    item.createEl("small", { cls: "btl-focus-bar-count", text: markerSummary(row.total) });
  }
}

function drawProjectBars(plot: HTMLElement, rows: readonly Row[], max: number): void {
  const chart = plot.createDiv({ cls: "btl-focus-project-bars" });
  for (const row of rows) {
    const value = burdenRate(row.total);
    const button = chart.createEl("button", { cls: "btl-focus-project-bar", attr: { type: "button", "aria-label": description(row) } });
    button.setAttr("title", description(row));
    button.onclick = row.open || (() => {});
    const label = button.createSpan({ text: row.label });
    if (row.color) label.style.color = row.color;
    const track = button.createSpan({ cls: "btl-focus-project-track" });
    const fill = track.createSpan();
    fill.style.width = `${row.total.load ? Math.max(3, Math.min(100, value / max * 100)) : 0}%`;
    button.createEl("strong", { text: burdenLabel(row.total) });
    button.createEl("small", { text: markerSummary(row.total) });
  }
}

function description(row: Row): string {
  return `${row.label} · 记录 ${Math.round(row.total.minutes)} 分钟 · 走神 ${row.total.distractions} 次 · 负担 ${row.total.load} · 顺畅 ${row.total.good} 次`;
}

function markerSummary(total: FocusTotal): string {
  return [total.distractions ? `${total.distractions}红` : "", total.good ? `${total.good}蓝` : ""].filter(Boolean).join(" · ");
}

function rangeLabel(dates: readonly Date[]): string {
  return `${dates[0].getMonth() + 1}/${dates[0].getDate()}–${dates[6].getMonth() + 1}/${dates[6].getDate()}`;
}

function readMode(): Mode {
  const saved = localStorage.getItem("branch-timeline-hz-focus-mode");
  return saved === "period" || saved === "project" ? saved : "day";
}

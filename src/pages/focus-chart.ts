import { Menu, setIcon } from "obsidian";
import type { BranchTimelineState, ProjectRef } from "../types";
import { focusRhythmColor } from "../focus-rhythm-color";
import { dateKey, logicalToday } from "../vault/format";
import { nowOnAxis } from "./focus-stats";
import { compareFocus, focusHours, focusSample, interruptionInterval, type FocusSample } from "./focus-comparison";

type SortField = "minutes" | "focus";
type Row = { label: string; total: FocusSample; open: () => void };

export interface FocusChartOptions {
  container: HTMLElement;
  controls?: HTMLElement;
  mode?: "project" | "day";
  dates: readonly Date[];
  state: BranchTimelineState;
  projects: readonly ProjectRef[];
  onOpenDate: (date: Date) => void;
  onOpenProject: (path: string) => void;
}

export function renderFocusChart(options: FocusChartOptions): void {
  const start = dateKey(options.dates[0]);
  const end = dateKey(options.dates[options.dates.length - 1]);
  const today = dateKey(logicalToday());
  const now = nowOnAxis();
  const baseline = focusSample(options.state.days, key => key < start, today, now);
  const controls = options.controls || options.container.createDiv({ cls: "btl-summary-tools" });
  const plot = options.container.createDiv({ cls: "btl-focus-summary" });
  let field: SortField = localStorage.getItem("branch-timeline-hz-focus-sort") === "focus" ? "focus" : "minutes";
  let descending = localStorage.getItem("branch-timeline-hz-focus-descending") !== "false";
  let sort: HTMLButtonElement | null = null;
  if (options.mode !== "day") {
    sort = controls.createEl("button", { cls: "btl-summary-select btl-focus-sort", attr: { type: "button", "aria-label": "项目排行排序" } });
    sort.onclick = event => {
      event.stopPropagation();
      const menu = new Menu();
      for (const [key, label] of [["minutes", "记录时长"], ["focus", "相对顺畅程度"]] as const) {
        menu.addItem(item => item.setTitle(label).setChecked(field === key).onClick(() => { field = key; save(); }));
      }
      menu.addSeparator();
      for (const [value, label] of [[true, "从高到低"], [false, "从低到高"]] as const) {
        menu.addItem(item => item.setTitle(label).setChecked(descending === value).onClick(() => { descending = value; save(); }));
      }
      const rect = sort!.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
    };
  }
  const rows = options.mode === "day" ? options.dates.map(date => ({
    label: ["日", "一", "二", "三", "四", "五", "六"][date.getDay()],
    total: focusSample(options.state.days, key => key === dateKey(date), today, now),
    open: () => options.onOpenDate(date)
  })) : options.projects.map(project => ({
    label: project.name,
    total: focusSample(options.state.days, key => key >= start && key <= end, today, now, project.path),
    open: () => options.onOpenProject(project.path)
  })).filter(row => row.total.minutes > 0);
  draw();

  function save(): void {
    localStorage.setItem("branch-timeline-hz-focus-sort", field);
    localStorage.setItem("branch-timeline-hz-focus-descending", String(descending));
    draw();
  }

  function draw(): void {
    plot.empty();
    if (sort) {
      sort.empty();
      sort.createSpan({ text: field === "minutes" ? "时长" : "顺畅" });
      setIcon(sort.createSpan(), descending ? "arrow-down-wide-narrow" : "arrow-up-narrow-wide");
    }
    if (!rows.some(row => row.total.minutes > 0)) {
      plot.createDiv({ cls: "btl-stats-empty", text: "本周暂无记录" });
      return;
    }
    if (options.mode === "day") drawDaily(plot, rows, baseline);
    else {
      const ordered = [...rows].sort((a, b) => {
        const difference = field === "minutes" ? a.total.minutes - b.total.minutes
          : compareFocus(a.total, baseline).score - compareFocus(b.total, baseline).score;
        return difference * (descending ? -1 : 1) || a.label.localeCompare(b.label);
      });
      drawProjects(plot, ordered, baseline);
    }
    drawLegend(plot, baseline);
  }
}

function drawProjects(parent: HTMLElement, rows: readonly Row[], baseline: FocusSample): void {
  const list = parent.createDiv({ cls: "btl-focus-ranking" });
  const maximum = Math.max(1, ...rows.map(row => row.total.minutes));
  for (const row of rows) {
    const button = list.createEl("button", { cls: "btl-focus-rank-row", attr: { type: "button", title: description(row, baseline) } });
    button.onclick = event => { event.stopPropagation(); row.open(); };
    const heading = button.createSpan({ cls: "btl-focus-rank-heading" });
    heading.createSpan({ cls: "btl-focus-rank-name", text: row.label });
    heading.createEl("strong", { text: focusHours(row.total.minutes) });
    const detail = button.createSpan({ cls: "btl-focus-rank-detail" });
    const track = detail.createSpan({ cls: "btl-focus-rank-track" });
    const fill = track.createSpan();
    fill.style.width = `${row.total.minutes / maximum * 100}%`;
    fill.style.background = focusRhythmColor(compareFocus(row.total, baseline).score);
    detail.createSpan({ cls: "btl-focus-rank-interval", text: intervalLabel(row.total) });
    button.setAttr("aria-label", description(row, baseline));
  }
}

function drawDaily(parent: HTMLElement, rows: readonly Row[], baseline: FocusSample): void {
  const chart = parent.createDiv({ cls: "btl-focus-daily" });
  const maximum = Math.max(1, ...rows.map(row => row.total.minutes));
  for (const row of rows) {
    const button = chart.createEl("button", { cls: "btl-focus-daily-column", attr: { type: "button", title: description(row, baseline), "aria-label": description(row, baseline) } });
    button.onclick = event => { event.stopPropagation(); row.open(); };
    button.createEl("strong", { text: row.total.minutes ? focusHours(row.total.minutes) : "–" });
    const track = button.createSpan({ cls: "btl-focus-daily-track" });
    const fill = track.createSpan();
    fill.style.height = `${row.total.minutes / maximum * 100}%`;
    fill.style.background = focusRhythmColor(compareFocus(row.total, baseline).score);
    button.createSpan({ text: row.label });
  }
}

function drawLegend(parent: HTMLElement, baseline: FocusSample): void {
  const legend = parent.createDiv({ cls: "btl-focus-relative-key" });
  legend.setAttr("title", baseline.minutes
    ? `颜色比较所选周之前全部 ${focusHours(baseline.minutes)} 记录的每小时加权中断负担；样本越少颜色越淡。条长表示记录时长。`
    : "尚无更早的记录，颜色暂为中性。条长表示记录时长。");
  legend.createSpan({ text: "较分散" });
  legend.createSpan({ cls: "btl-focus-relative-gradient" });
  legend.createSpan({ text: "较顺畅" });
}

function intervalLabel(total: FocusSample): string {
  const interval = interruptionInterval(total);
  return interval === null ? "未记走神" : `${Math.round(interval)} min/次`;
}

function description(row: Row, baseline: FocusSample): string {
  const comparison = compareFocus(row.total, baseline);
  const relative = !comparison.confidence ? "颜色中性" : comparison.score > .52 ? "较平常顺畅" : comparison.score < .48 ? "较平常分散" : "接近平常";
  return `${row.label} · ${focusHours(row.total.minutes)} · ${intervalLabel(row.total)} · ${relative}`;
}

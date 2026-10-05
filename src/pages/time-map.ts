import { itemEnd, itemStart, formatTime } from "../timeline/model";
import { compactDuration, isRunningItem } from "../timeline/timer-service";
import type { BranchTimelineState, ProjectRef, TimelineItem } from "../types";
import { distractionLabel, distractionLevel } from "../focus-events";
import { dateKey, logicalToday } from "../vault/format";
import { focusRhythm, nowOnAxis } from "./focus-stats";

export interface SleepSpan { bed: number; wake: number; duration: number }
const START = 18 * 60;
const END = START + 32 * 60;

export function sleepSpan(date: Date, state: BranchTimelineState): SleepSpan | null {
  const day = state.days[dateKey(date)];
  const previous = state.days[dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1))];
  if (!day?.wakeReal || !previous?.sleepReal) return null;
  let bed = previous.sleep;
  if (bed < 12 * 60) bed += 1440;
  let wake = day.wake;
  while (wake < bed) wake += 1440;
  const duration = wake - bed;
  return duration > 0 && duration <= 16 * 60 ? { bed, wake, duration } : null;
}

export function mapPosition(minute: number): number {
  return Math.max(0, Math.min(100, (minute - START) / (END - START) * 100));
}

export interface TimeMapOptions {
  dates: readonly Date[];
  selected: Date;
  state: BranchTimelineState;
  projects: readonly ProjectRef[];
  onOpenDate: (date: Date) => void;
}

export function renderTimeMap(parent: HTMLElement, options: TimeMapOptions): void {
  const map = parent.createDiv({ cls: "btl-time-map" });
  const legend = map.createDiv({ cls: "btl-time-map-legend" });
  for (const [kind, label] of [["sleep", "睡眠"], ["activity", "记录"], ["dot", "走神"], ["good", "顺畅"]] as const) {
    legend.createSpan({ cls: `btl-time-map-key is-${kind}`, text: label });
  }
  const rhythm = focusRhythm(options.state, options.dates[options.dates.length - 1], nowOnAxis());
  if (rhythm.some(score => score != null)) legend.createSpan({ cls: "btl-time-map-key is-rhythm", text: "顺畅度推测" });
  const header = map.createDiv({ cls: "btl-time-map-header" });
  header.createSpan();
  for (const date of options.dates) {
    const button = header.createEl("button", { text: `${weekday(date)}${date.getDate()}`, attr: { type: "button", "aria-label": `${date.getMonth() + 1}月${date.getDate()}日` } });
    button.toggleClass("is-selected", dateKey(date) === dateKey(options.selected));
    button.onclick = () => options.onOpenDate(date);
  }
  const chart = map.createDiv({ cls: "btl-time-map-chart" });
  const axis = chart.createDiv({ cls: "btl-time-map-axis" });
  const plot = chart.createDiv({ cls: "btl-time-map-plot" });
  const tooltip = map.createDiv({ cls: "btl-time-map-tooltip is-hidden" });
  const show = (button: HTMLElement, content: string) => {
    tooltip.setText(content);
    tooltip.removeClass("is-hidden");
    const mapRect = map.getBoundingClientRect();
    const targetRect = button.getBoundingClientRect();
    tooltip.style.left = `${Math.max(0, Math.min(map.clientWidth - tooltip.offsetWidth, targetRect.left - mapRect.left))}px`;
    const below = targetRect.bottom - mapRect.top + 6;
    tooltip.style.top = `${below + tooltip.offsetHeight <= map.clientHeight ? below : Math.max(0, targetRect.top - mapRect.top - tooltip.offsetHeight - 6)}px`;
  };
  for (const [minute, label] of [[1080, "昨18"], [1440, "0"], [1800, "6"], [2160, "12"], [2520, "18"], [2880, "24"], [3000, "次2"]] as const) {
    const position = `${mapPosition(minute)}%`;
    const tick = axis.createSpan({ text: label });
    tick.style.top = position;
    plot.createDiv({ cls: "btl-time-map-gridline" }).style.top = position;
  }
  const spans = options.dates.map(date => sleepSpan(date, options.state)).filter((span): span is SleepSpan => !!span);
  if (spans.length) {
    drawAverage(plot, "bed", spans.reduce((sum, span) => sum + span.bed, 0) / spans.length);
    drawAverage(plot, "wake", spans.reduce((sum, span) => sum + span.wake, 0) / spans.length);
  }
  const columns = plot.createDiv({ cls: "btl-time-map-columns" });
  const colors = new Map(options.projects.map(project => [project.path, project.color || "var(--interactive-accent)"]));
  const today = dateKey(logicalToday());
  for (const date of options.dates) {
    const key = dateKey(date);
    const column = columns.createDiv({ cls: "btl-time-map-day" });
    column.toggleClass("is-selected", key === dateKey(options.selected));
    const sleep = sleepSpan(date, options.state);
    if (sleep) drawBand(column, "sleep", sleep.bed, sleep.wake, "睡眠", "var(--color-purple)", show);
    const day = options.state.days[key];
    if (!day) continue;
    const now = key === today ? nowOnAxis() : undefined;
    const records = day.items.filter(item => item.kind === "fact" || isRunningItem(item));
    records.sort((a, b) => duration(b, day.wake, now) - duration(a, day.wake, now));
    for (const item of records) drawItem(column, item, day.wake, now, colors.get(item.projectPath || "") || "var(--interactive-accent)", show);
    for (const event of day.distractions || []) {
      const label = `${distractionLabel(event)} · ${formatTime(event.minute)}`;
      const dot = column.createEl("button", { cls: `btl-time-map-dot is-distraction is-${distractionLevel(event)}`, attr: { type: "button", "aria-label": label, title: label } });
      dot.style.top = `${mapPosition(event.minute + 1440)}%`;
      dot.onclick = () => show(dot, label);
    }
    for (const event of day.goodStates || []) {
      const label = `状态顺畅 · ${formatTime(event.minute)}`;
      const dot = column.createEl("button", { cls: "btl-time-map-dot is-good", attr: { type: "button", "aria-label": label, title: label } });
      dot.style.top = `${mapPosition(event.minute + 1440)}%`;
      dot.onclick = () => show(dot, label);
    }
  }
  drawRhythm(plot, rhythm);
  map.onclick = event => { if (!(event.target as HTMLElement).closest(".btl-time-map-band, .btl-time-map-dot")) tooltip.addClass("is-hidden"); };
}

function duration(item: TimelineItem, wake: number, now?: number): number {
  return Math.max(0, itemEnd(item, wake, now) - itemStart(item, wake));
}

function drawItem(column: HTMLElement, item: TimelineItem, wake: number, now: number | undefined, color: string, show: (button: HTMLElement, content: string) => void): void {
  const start = itemStart(item, wake) + 1440;
  const end = itemEnd(item, wake, now) + 1440;
  drawBand(column, "activity", start, end, item.title, color, show);
}

function drawBand(column: HTMLElement, kind: "sleep" | "activity", start: number, end: number, title: string, color: string, show: (button: HTMLElement, content: string) => void): void {
  if (start > END || end < START) return;
  const visibleStart = mapPosition(start);
  const visibleEnd = mapPosition(end);
  const length = Math.max(visibleEnd - visibleStart, end === start ? .5 : .25);
  const label = `${title} · ${formatTime(start)}–${formatTime(end)} · ${compactDuration(Math.max(0, end - start))}`;
  const band = column.createEl("button", { cls: `btl-time-map-band is-${kind}`, attr: { type: "button", "aria-label": label, title: `${title} · ${compactDuration(Math.max(0, end - start))}` } });
  band.style.top = `${visibleStart}%`;
  band.style.height = `${length}%`;
  band.style.setProperty("--btl-band-color", color);
  band.createSpan({ cls: "btl-time-map-cap is-start", attr: { title: `开始 ${formatTime(start)}` } });
  band.createSpan({ cls: "btl-time-map-cap is-end", attr: { title: `结束 ${formatTime(end)}` } });
  band.onclick = () => show(band, label);
}

function drawAverage(plot: HTMLElement, kind: "bed" | "wake", minute: number): void {
  const line = plot.createDiv({ cls: `btl-time-map-average is-${kind}`, attr: { title: `平均${kind === "bed" ? "入睡" : "起床"} ${formatTime(Math.round(minute))}` } });
  line.style.top = `${mapPosition(minute)}%`;
}

function drawRhythm(plot: HTMLElement, values: readonly (number | null)[]): void {
  if (!values.some(value => value != null)) return;
  const rail = plot.createDiv({ cls: "btl-time-map-rhythm" });
  for (let minute = START; minute < END; minute += 60) {
    const score = values[Math.floor(minute / 60) % 24];
    if (score == null) continue;
    const next = values[(Math.floor(minute / 60) + 1) % 24];
    const color = (value: number) => `hsl(${Math.round(210 - 170 * value)} 76% 55%)`;
    const segment = rail.createSpan({ attr: { title: `记录中的顺畅度 · ${formatTime(minute)}` } });
    segment.style.top = `${mapPosition(minute)}%`;
    segment.style.height = `${mapPosition(minute + 60) - mapPosition(minute)}%`;
    segment.style.background = `linear-gradient(${color(score)}, ${color(next ?? score)})`;
  }
}

function weekday(date: Date): string { return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()]; }

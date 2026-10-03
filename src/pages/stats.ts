import type { BranchTimelineState, ProjectRef } from "../types";
import { periodAtMinute, periodMinutes, projectFocusTotal, recordedMinutes, type DayPeriod } from "./focus-stats";
import { policyProgress } from "./policy-progress";
import { dateKey, logicalToday } from "../vault/format";
import { startOfWeek } from "./navigation";

export interface StatsPageOptions {
  container: HTMLElement;
  date: Date;
  state: BranchTimelineState;
  projects: readonly ProjectRef[];
  onOpenDate: (date: Date) => void;
  onOpenProject: (path: string) => void;
  onOpenPolicy: () => void;
}

type SleepSpan = { bed: number; wake: number; duration: number };

export function renderStatsPage(options: StatsPageOptions): void {
  const start = startOfWeek(options.date);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const previous = dates.map(date => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7));
  const dashboard = options.container.createDiv({ cls: "btl-stats-dashboard" });
  renderSleepCard(dashboard, dates, previous, options.state, options.onOpenDate);
  renderRecordedTimeCard(dashboard, dates, options.date, options.state);
  const lower = dashboard.createDiv({ cls: "btl-stats-lower" });
  renderDistractionCard(lower, dates, previous, options.state, options.onOpenDate);
  renderAnchorCard(lower, dates, options.state, options.onOpenPolicy);
  renderProjectFocusCard(dashboard, options);
}

function nowOnAxis(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + (now.getHours() < 2 ? 1440 : 0);
}

function renderRecordedTimeCard(parent: HTMLElement, dates: readonly Date[], selected: Date, state: BranchTimelineState): void {
  const card = statsCard(parent, "记录时间", rangeLabel(dates));
  const today = dateKey(logicalToday());
  const now = nowOnAxis();
  const selectedKey = dateKey(selected);
  const selectedDay = state.days[selectedKey];
  const daily = selectedDay ? recordedMinutes(selectedDay, selectedKey === today ? now : undefined) : 0;
  const weekly = dates.reduce((sum, date) => {
    const key = dateKey(date);
    const day = state.days[key];
    return sum + (day ? recordedMinutes(day, key === today ? now : undefined) : 0);
  }, 0);
  const metrics = card.createDiv({ cls: "btl-stats-metrics btl-focus-metrics" });
  metric(metrics, dateLabel(selected) + "总计", durationLabel(daily), null);
  metric(metrics, "本周总计", durationLabel(weekly), null);
  const periods: Record<DayPeriod, { minutes: number; distractions: number }> = {
    morning: { minutes: 0, distractions: 0 },
    afternoon: { minutes: 0, distractions: 0 },
    evening: { minutes: 0, distractions: 0 }
  };
  for (const date of dates) {
    const key = dateKey(date);
    const day = state.days[key];
    if (!day) continue;
    const minutes = periodMinutes(day, key === today ? now : undefined);
    for (const period of Object.keys(periods) as DayPeriod[]) periods[period].minutes += minutes[period];
    for (const event of day.distractions || []) periods[periodAtMinute(event.minute)].distractions++;
  }
  const row = card.createDiv({ cls: "btl-focus-periods" });
  for (const [period, label] of [["morning", "上午"], ["afternoon", "下午"], ["evening", "晚上"]] as const) {
    const tile = row.createDiv({ cls: "btl-focus-period" });
    tile.createEl("small", { text: label + " · 每次分神间隔" });
    tile.createEl("strong", { text: periods[period].distractions ? durationLabel(periods[period].minutes / periods[period].distractions) : "–" });
  }
}

function renderProjectFocusCard(parent: HTMLElement, options: StatsPageOptions): void {
  const card = statsCard(parent, "项目分神", "累计");
  const today = dateKey(logicalToday());
  const now = nowOnAxis();
  const rows = options.projects.map(project => ({ project, total: projectFocusTotal(options.state, project.path, today, now) }))
    .filter(row => row.total.minutes || row.total.distractions)
    .sort((a, b) => b.total.minutes - a.total.minutes);
  if (!rows.length) { card.createDiv({ cls: "btl-stats-empty", text: "暂无记录" }); return; }
  const list = card.createDiv({ cls: "btl-focus-projects" });
  for (const { project, total } of rows) {
    const row = list.createEl("button", { cls: "btl-focus-project", attr: { type: "button", "aria-label": "查看项目 " + project.name } });
    row.onclick = () => options.onOpenProject(project.path);
    const title = row.createSpan({ cls: "btl-focus-project-name", text: project.name });
    if (project.color) title.style.color = project.color;
    row.createEl("small", { text: durationLabel(total.minutes) + " · " + total.distractions + "次" });
    row.createEl("strong", { text: total.distractions ? durationLabel(total.minutes / total.distractions) + "/次" : "–" });
  }
}

function renderSleepCard(
  dashboard: HTMLElement,
  dates: readonly Date[],
  previous: readonly Date[],
  state: BranchTimelineState,
  onOpenDate: (date: Date) => void
): void {
  const card = statsCard(dashboard, "睡眠", rangeLabel(dates));
  const currentSpans = dates.map(date => sleepSpan(date, state));
  const previousSpans = previous.map(date => sleepSpan(date, state)).filter((span): span is SleepSpan => !!span);
  const current = currentSpans.filter((span): span is SleepSpan => !!span);
  const metrics = card.createDiv({ cls: "btl-stats-metrics" });
  metric(metrics, "平均入睡", current.length ? timeLabel(average(current.map(span => span.bed))) : "–", timeChange(current, previousSpans, "bed"));
  metric(metrics, "平均起床", current.length ? timeLabel(average(current.map(span => span.wake))) : "–", timeChange(current, previousSpans, "wake"));
  metric(metrics, "平均睡眠", current.length ? durationLabel(average(current.map(span => span.duration))) : "–", durationChange(current, previousSpans));

  const chart = card.createDiv({ cls: "btl-sleep-chart" });
  const axis = chart.createDiv({ cls: "btl-sleep-axis" });
  axis.createSpan({ text: "18:00" });
  axis.createSpan({ text: "24:00" });
  axis.createSpan({ text: "06:00" });
  axis.createSpan({ text: "12:00" });
  for (const [index, date] of dates.entries()) {
    const row = chart.createEl("button", { cls: "btl-sleep-row", attr: { type: "button", "aria-label": dateLabel(date) + " 睡眠" } });
    row.onclick = () => onOpenDate(date);
    row.createSpan({ cls: "btl-stats-day-label", text: weekdayLabel(date) + " " + date.getDate() });
    const track = row.createSpan({ cls: "btl-sleep-track" });
    const span = currentSpans[index];
    if (!span) {
      track.createSpan({ cls: "btl-sleep-empty", text: "–" });
      continue;
    }
    const left = Math.max(0, Math.min(100, ((span.bed - 18 * 60) / (20 * 60)) * 100));
    const right = Math.max(left + 1, Math.min(100, ((span.wake - 18 * 60) / (20 * 60)) * 100));
    const band = track.createSpan({ cls: "btl-sleep-band" });
    band.style.setProperty("--btl-sleep-left", left + "%");
    band.style.setProperty("--btl-sleep-width", right - left + "%");
    band.setAttr("title", timeLabel(span.bed) + "–" + timeLabel(span.wake));
  }
}

function renderDistractionCard(
  dashboard: HTMLElement,
  dates: readonly Date[],
  previous: readonly Date[],
  state: BranchTimelineState,
  onOpenDate: (date: Date) => void
): void {
  const card = statsCard(dashboard, "分神", rangeLabel(dates));
  const counts = dates.map(date => state.days[dateKey(date)]?.distractions?.length || 0);
  const previousCount = previous.reduce((sum, date) => sum + (state.days[dateKey(date)]?.distractions?.length || 0), 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const metrics = card.createDiv({ cls: "btl-stats-metrics is-single" });
  metric(metrics, "本周分神", String(total), countChange(total, previousCount));
  const chart = card.createDiv({ cls: "btl-distraction-chart" });
  const max = Math.max(1, ...counts);
  for (const [index, date] of dates.entries()) {
    const button = chart.createEl("button", { cls: "btl-distraction-day", attr: { type: "button", "aria-label": dateLabel(date) + " " + counts[index] + " 次" } });
    button.onclick = () => onOpenDate(date);
    const bar = button.createSpan({ cls: "btl-distraction-bar" });
    bar.style.setProperty("--btl-distraction-height", Math.max(5, counts[index] / max * 100) + "%");
    button.createSpan({ cls: "btl-distraction-count", text: String(counts[index]) });
    button.createEl("small", { text: weekdayLabel(date) });
  }
}

function renderAnchorCard(dashboard: HTMLElement, dates: readonly Date[], state: BranchTimelineState, onOpenPolicy: () => void): void {
  const card = statsCard(dashboard, "锚点", rangeLabel(dates));
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
    row.createEl("small", { text: success + "/" + violations });
    row.createEl("strong", { text: progress.count ? String(progress.count) : "–" });
  }
}

function statsCard(parent: HTMLElement, title: string, range: string): HTMLElement {
  const card = parent.createDiv({ cls: "btl-stats-card" });
  const head = card.createDiv({ cls: "btl-stats-card-head" });
  head.createEl("strong", { text: title });
  head.createEl("small", { text: range });
  return card;
}

function metric(parent: HTMLElement, label: string, value: string, change: Change | null): void {
  const tile = parent.createDiv({ cls: "btl-stats-metric" });
  tile.createEl("small", { text: label });
  tile.createEl("strong", { text: value });
  if (change) tile.createSpan({ cls: "btl-stats-change " + change.tone, text: change.text });
}

type Change = { text: string; tone: "is-good" | "is-bad" | "is-neutral" };

function timeChange(current: readonly SleepSpan[], previous: readonly SleepSpan[], key: "bed" | "wake"): Change | null {
  if (!current.length || !previous.length) return null;
  const difference = Math.round(average(current.map(span => span[key])) - average(previous.map(span => span[key])));
  if (Math.abs(difference) < 5) return { text: "±0m", tone: "is-neutral" };
  return { text: (difference > 0 ? "+" : "−") + Math.abs(difference) + "m", tone: key === "bed" ? (difference < 0 ? "is-good" : "is-bad") : "is-neutral" };
}

function durationChange(current: readonly SleepSpan[], previous: readonly SleepSpan[]): Change | null {
  if (!current.length || !previous.length) return null;
  const difference = Math.round(average(current.map(span => span.duration)) - average(previous.map(span => span.duration)));
  if (Math.abs(difference) < 5) return { text: "±0m", tone: "is-neutral" };
  return { text: (difference > 0 ? "+" : "−") + Math.abs(difference) + "m", tone: difference > 0 ? "is-good" : "is-bad" };
}

function countChange(current: number, previous: number): Change | null {
  if (!previous && !current) return null;
  const difference = current - previous;
  if (!difference) return { text: "±0", tone: "is-neutral" };
  return { text: (difference > 0 ? "+" : "−") + Math.abs(difference), tone: difference < 0 ? "is-good" : "is-bad" };
}

function sleepSpan(date: Date, state: BranchTimelineState): SleepSpan | null {
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

function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function timeLabel(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return String(Math.floor(normalized / 60)).padStart(2, "0") + ":" + String(normalized % 60).padStart(2, "0");
}
function durationLabel(value: number): string {
  const minutes = Math.round(value);
  return Math.floor(minutes / 60) + "h " + String(minutes % 60).padStart(2, "0") + "m";
}
function rangeLabel(dates: readonly Date[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return (first.getMonth() + 1) + "/" + first.getDate() + "–" + (last.getMonth() + 1) + "/" + last.getDate();
}
function dateLabel(date: Date): string { return (date.getMonth() + 1) + "月" + date.getDate() + "日"; }
function weekdayLabel(date: Date): string { return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()]; }

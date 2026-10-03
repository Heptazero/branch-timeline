import type { BranchTimelineState, ProjectRef } from "../types";
import { nowOnAxis, recordedMinutes } from "./focus-stats";
import { renderFocusChart } from "./focus-chart";
import { renderTimeMap, sleepSpan, type SleepSpan } from "./time-map";
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

export function renderStatsPage(options: StatsPageOptions): void {
  const start = startOfWeek(options.date);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const previous = dates.map(date => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7));
  const dashboard = options.container.createDiv({ cls: "btl-stats-dashboard" });
  renderSleepCard(dashboard, dates, previous, options);
  renderFocusChart({ container: dashboard, dates, state: options.state, projects: options.projects, onOpenDate: options.onOpenDate, onOpenProject: options.onOpenProject });
  renderAnchorCard(dashboard, dates, options.state, options.onOpenPolicy);
}

function renderRecordedTimeMetrics(card: HTMLElement, dates: readonly Date[], selected: Date, state: BranchTimelineState): void {
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
}

function renderSleepCard(
  dashboard: HTMLElement,
  dates: readonly Date[],
  previous: readonly Date[],
  options: StatsPageOptions
): void {
  const card = statsCard(dashboard, "一周时间", rangeLabel(dates));
  const currentSpans = dates.map(date => sleepSpan(date, options.state));
  const previousSpans = previous.map(date => sleepSpan(date, options.state)).filter((span): span is SleepSpan => !!span);
  const current = currentSpans.filter((span): span is SleepSpan => !!span);
  const metrics = card.createDiv({ cls: "btl-stats-metrics" });
  metric(metrics, "平均入睡", current.length ? timeLabel(average(current.map(span => span.bed))) : "–", timeChange(current, previousSpans, "bed"));
  metric(metrics, "平均起床", current.length ? timeLabel(average(current.map(span => span.wake))) : "–", timeChange(current, previousSpans, "wake"));
  metric(metrics, "平均睡眠", current.length ? durationLabel(average(current.map(span => span.duration))) : "–", durationChange(current, previousSpans));
  renderRecordedTimeMetrics(card, dates, options.date, options.state);
  renderTimeMap(card, { dates, selected: options.date, state: options.state, projects: options.projects, onOpenDate: options.onOpenDate });
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

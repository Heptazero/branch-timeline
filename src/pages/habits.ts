import { Menu } from "obsidian";
import { installLongPressSort } from "../interactions/long-press-sort";
import { itemDuration } from "../timeline/model";
import type { BranchTimelineState, DiaryDaySnapshot, PolicyCard, TimelineTag } from "../types";
import { dateKey } from "../vault/format";
import { startOfWeek } from "./navigation";

type HabitRef = { id: string; name: string; kind: "diary" | "policy"; color: string };

export interface HabitPageOptions {
  container: HTMLElement;
  date: Date;
  habits: readonly string[];
  tags: readonly TimelineTag[];
  state: BranchTimelineState;
  cardOrder: readonly string[];
  readDay: (date: Date) => Promise<DiaryDaySnapshot>;
  setHabit: (date: Date, habit: string, done: boolean) => Promise<void>;
  togglePolicyHabit: (cardId: string, date: string) => Promise<void>;
  isCurrent: () => boolean;
  refresh: () => Promise<void>;
  onAdd: () => void;
  onReorderHabits: (names: string[]) => void;
  onReorderCards: (ids: string[]) => void;
  onEditTags: () => void;
}

export async function renderHabitsPage(options: HabitPageOptions): Promise<void> {
  const { container, date, habits, readDay, isCurrent } = options;
  const start = startOfWeek(date);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthDates = Array.from({ length: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() }, (_, index) =>
    new Date(date.getFullYear(), date.getMonth(), index + 1));
  const needed = new Map<string, Date>();
  [...dates, ...monthDates].forEach(day => needed.set(dateKey(day), day));
  const snapshots = new Map<string, DiaryDaySnapshot>();
  await Promise.all([...needed.entries()].map(async ([key, day]) => snapshots.set(key, await readDay(day))));
  if (!isCurrent()) return;

  const policyHabits = options.state.policyCards.filter(card => card.habit && !card.deletedDate);
  const refs: HabitRef[] = [
    ...habits.map((name, index) => ({ id: `diary:${name}`, name, kind: "diary" as const, color: palette(index) })),
    ...policyHabits.map((card, index) => ({ id: `policy:${card.id}`, name: card.name, kind: "policy" as const, color: palette(index + habits.length) }))
  ];
  const dashboard = container.createDiv({ cls: "btl-habit-dashboard" });
  const order = normalizeCardOrder(options.cardOrder);
  for (const id of order) {
    const card = dashboard.createDiv({ cls: `btl-habit-card is-${id}`, attr: { "data-habit-card": id } });
    if (id === "week") renderWeekCard(card, refs, dates, snapshots, policyHabits, options);
    else if (id === "month") renderMonthCard(card, refs, monthStart, monthDates, snapshots, options);
    else if (id === "sleep") renderSleepCard(card, dates, options.state);
    else renderTagCard(card, dates, options);
  }
  installLongPressSort(dashboard, {
    itemSelector: ".btl-habit-card",
    idAttribute: "data-habit-card",
    onOrder: options.onReorderCards
  });
}

function renderWeekCard(
  card: HTMLElement,
  refs: readonly HabitRef[],
  dates: readonly Date[],
  snapshots: ReadonlyMap<string, DiaryDaySnapshot>,
  policyCards: readonly PolicyCard[],
  options: HabitPageOptions
): void {
  const head = card.createDiv({ cls: "btl-habit-card-head" });
  head.createEl("strong", { text: "本周习惯" });
  const more = head.createEl("button", { text: "⋮", attr: { "aria-label": "习惯菜单", "data-no-sort": "true" } });
  more.onclick = event => {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("添加习惯").setIcon("plus").onClick(options.onAdd));
    menu.showAtMouseEvent(event);
  };
  const table = card.createDiv({ cls: "btl-habit-week" });
  renderHeader(table, dates);
  const diary = refs.filter(ref => ref.kind === "diary");
  const anchors = refs.filter(ref => ref.kind === "policy");
  if (diary.length) renderGroupLabel(table, "日志");
  for (const ref of diary) renderHabitRow(table, ref, dates, snapshots, policyCards, options);
  if (anchors.length) renderGroupLabel(table, "锚点");
  for (const ref of anchors) renderHabitRow(table, ref, dates, snapshots, policyCards, options);
  installLongPressSort(table, {
    itemSelector: ".btl-habit-week-row[data-diary-habit]",
    idAttribute: "data-diary-habit",
    onOrder: options.onReorderHabits
  });
}

function renderHeader(table: HTMLElement, dates: readonly Date[]): void {
  const header = table.createDiv({ cls: "btl-habit-week-row is-header" });
  header.createSpan();
  for (const date of dates) {
    const cell = header.createSpan();
    cell.createSpan({ text: weekdayLabel(date) });
    cell.createEl("small", { text: String(date.getDate()) });
  }
}

function renderGroupLabel(table: HTMLElement, label: string): void {
  table.createDiv({ cls: "btl-habit-group-label", text: label });
}

function renderHabitRow(
  table: HTMLElement,
  ref: HabitRef,
  dates: readonly Date[],
  snapshots: ReadonlyMap<string, DiaryDaySnapshot>,
  policyCards: readonly PolicyCard[],
  options: HabitPageOptions
): void {
  const row = table.createDiv({ cls: "btl-habit-week-row" });
  if (ref.kind === "diary") row.setAttr("data-diary-habit", ref.name);
  row.style.setProperty("--btl-habit-color", ref.color);
  row.createSpan({ cls: "btl-habit-name", text: ref.name });
  dates.forEach(date => {
    const key = dateKey(date);
    const done = habitDone(ref, key, snapshots, options.state);
    const button = row.createEl("button", {
      cls: `btl-habit-cell${done ? " is-done" : ""}`,
      attr: { "aria-label": `${ref.name} · ${date.getMonth() + 1}月${date.getDate()}日`, "data-no-sort": "true" }
    });
    button.onclick = async () => {
      if (ref.kind === "diary") await options.setHabit(date, ref.name, !done);
      else await options.togglePolicyHabit(ref.id.slice(7), key);
      await options.refresh();
    };
  });
}

function renderMonthCard(
  card: HTMLElement,
  refs: readonly HabitRef[],
  month: Date,
  dates: readonly Date[],
  snapshots: ReadonlyMap<string, DiaryDaySnapshot>,
  options: HabitPageOptions
): void {
  const stored = localStorage.getItem("branch-timeline-hz-habit-heatmap");
  const selected = refs.find(ref => ref.id === stored) || refs[0];
  const head = card.createDiv({ cls: "btl-habit-card-head" });
  const picker = head.createEl("button", { text: selected?.name || "月热力图", cls: "btl-habit-picker", attr: { "data-no-sort": "true" } });
  picker.onclick = event => {
    const menu = new Menu();
    for (const ref of refs) menu.addItem(item => item.setTitle(ref.name).onClick(() => {
      localStorage.setItem("branch-timeline-hz-habit-heatmap", ref.id);
      void options.refresh();
    }));
    menu.showAtMouseEvent(event);
  };
  head.createSpan({ text: `${month.getFullYear()}年${month.getMonth() + 1}月` });
  const grid = card.createDiv({ cls: "btl-habit-month" });
  for (const day of ["一", "二", "三", "四", "五", "六", "日"]) grid.createSpan({ cls: "btl-habit-month-weekday", text: day });
  const offset = (month.getDay() + 6) % 7;
  for (let index = 0; index < offset; index++) grid.createSpan();
  for (const date of dates) {
    const done = selected ? habitDone(selected, dateKey(date), snapshots, options.state) : false;
    const cell = grid.createSpan({ cls: `btl-habit-month-day${done ? " is-done" : ""}`, text: String(date.getDate()) });
    if (selected) cell.style.setProperty("--btl-habit-color", selected.color);
  }
}

function renderSleepCard(card: HTMLElement, dates: readonly Date[], state: BranchTimelineState): void {
  card.createDiv({ cls: "btl-habit-card-head" }).createEl("strong", { text: "睡眠" });
  const current = sleepAverages(dates.map(dateKey), state);
  const previousDates = dates.map(date => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7)).map(dateKey);
  const previous = sleepAverages(previousDates, state);
  const stats = card.createDiv({ cls: "btl-sleep-stats" });
  renderStat(stats, "平均入睡", current ? formatTime(current.bed) : "–", trend(current?.bed, previous?.bed, true));
  renderStat(stats, "平均睡眠时长", current ? durationLabel(current.duration) : "–", trend(current?.duration, previous?.duration, false));
}

function renderStat(container: HTMLElement, label: string, value: string, change: { text: string; tone: string } | null): void {
  const tile = container.createDiv({ cls: "btl-sleep-stat" });
  tile.createSpan({ text: label });
  tile.createEl("strong", { text: value });
  if (change) tile.createEl("small", { text: change.text, cls: change.tone });
}

function renderTagCard(card: HTMLElement, dates: readonly Date[], options: HabitPageOptions): void {
  const head = card.createDiv({ cls: "btl-habit-card-head" });
  head.createEl("strong", { text: "标签趋势" });
  const more = head.createEl("button", { text: "⋮", attr: { "aria-label": "标签趋势菜单", "data-no-sort": "true" } });
  more.onclick = event => {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("编辑标签").setIcon("tags").onClick(options.onEditTags));
    menu.showAtMouseEvent(event);
  };
  const totals = options.tags.map(tag => ({
    tag,
    values: dates.map(date => tagMinutes(options.state, dateKey(date), tag.id, tag.name))
  }));
  const max = Math.max(60, ...totals.flatMap(series => series.values));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.addClass("btl-tag-chart");
  svg.setAttribute("viewBox", "0 0 320 150");
  for (let index = 0; index < 4; index++) {
    const line = document.createElementNS(svg.namespaceURI, "line");
    const y = 12 + index * 34;
    line.setAttribute("x1", "28"); line.setAttribute("x2", "312"); line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y));
    line.addClass("btl-tag-grid-line"); svg.appendChild(line);
  }
  for (const series of totals) {
    const polyline = document.createElementNS(svg.namespaceURI, "polyline");
    polyline.setAttribute("points", series.values.map((value, index) => `${30 + index * 46},${114 - value / max * 100}`).join(" "));
    polyline.setAttribute("stroke", series.tag.color); polyline.addClass("btl-tag-series"); svg.appendChild(polyline);
  }
  dates.forEach((date, index) => {
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", String(30 + index * 46));
    label.setAttribute("y", "136");
    label.setAttribute("text-anchor", "middle");
    label.addClass("btl-tag-axis-label");
    label.textContent = weekdayLabel(date);
    svg.appendChild(label);
  });
  card.appendChild(svg);
  const legend = card.createDiv({ cls: "btl-tag-legend" });
  for (const series of totals) {
    const item = legend.createSpan({ text: `● ${series.tag.name}` });
    item.style.color = series.tag.color;
  }
}

function habitDone(ref: HabitRef, date: string, snapshots: ReadonlyMap<string, DiaryDaySnapshot>, state: BranchTimelineState): boolean {
  if (ref.kind === "diary") return !!snapshots.get(date)?.habits[ref.name];
  const cardId = ref.id.slice(7);
  return state.policyEvents.some(event => event.cardId === cardId && event.date === date && event.result !== "violation");
}

function sleepAverages(dates: readonly string[], state: BranchTimelineState): { bed: number; duration: number } | null {
  const spans: Array<{ bed: number; duration: number }> = [];
  for (const date of dates) {
    const wake = state.days[date];
    const previous = state.days[previousDate(date)];
    if (!wake?.wakeReal || !previous?.sleepReal) continue;
    let bed = previous.sleep;
    if (bed < 12 * 60) bed += 1440;
    let wakeAt = wake.wake;
    while (wakeAt < bed) wakeAt += 1440;
    const duration = wakeAt - bed;
    if (duration <= 0 || duration > 16 * 60) continue;
    spans.push({ bed, duration });
  }
  if (!spans.length) return null;
  return {
    bed: spans.reduce((sum, span) => sum + span.bed, 0) / spans.length,
    duration: spans.reduce((sum, span) => sum + span.duration, 0) / spans.length
  };
}

function trend(current: number | undefined, previous: number | undefined, earlierIsGood: boolean): { text: string; tone: string } | null {
  if (current == null) return null;
  if (previous == null) return { text: "—", tone: "is-neutral" };
  const difference = Math.round(current - previous);
  if (Math.abs(difference) < 5) return { text: "±0m", tone: "is-neutral" };
  const good = earlierIsGood ? difference < 0 : difference > 0;
  return { text: `${difference > 0 ? "+" : "−"}${Math.abs(difference)}m`, tone: good ? "is-good" : "is-bad" };
}

function tagMinutes(state: BranchTimelineState, date: string, tagId: string, tagName: string): number {
  const day = state.days[date];
  if (!day) return 0;
  return day.items.reduce((total, item) => total + (item.kind === "fact" && (item.tagId === tagId || item.tag === tagName) ? itemDuration(item, day.wake) : 0), 0);
}

function normalizeCardOrder(order: readonly string[]): string[] {
  const allowed = ["week", "month", "sleep", "tags"];
  return [...order.filter(id => allowed.includes(id)), ...allowed.filter(id => !order.includes(id))];
}

function previousDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return dateKey(new Date(year, month - 1, day - 1));
}

function formatTime(minute: number): string {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function durationLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, "0")}m`;
}

function weekdayLabel(date: Date): string { return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()]; }
function palette(index: number): string { return ["#3b82f6", "#22c55e", "#a855f7", "#eab308", "#14b8a6", "#f97316"][index % 6]; }

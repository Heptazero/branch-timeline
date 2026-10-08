import { Menu, setIcon } from "obsidian";
import type { LifeEvent } from "../types";
import { dateKey } from "../vault/format";
import type { LifeDiaryEntry, LifeDiaryWeek } from "./life-diary";
import { clusterLifeEvents, lifeDateAt, lifeDateLabel, lifeDatePosition, lifeRange } from "./life-model";

const TOP = 42;
const MIN_SCALE = 12;
const MAX_SCALE = 8000;
const CHAPTER_COLORS = ["#5887b8", "#7d72b4", "#65a28d", "#b48669", "#a77b9d"];

export interface LifePageOptions {
  container: HTMLElement;
  events: readonly LifeEvent[];
  weeks: readonly LifeDiaryWeek[];
  anchor?: number;
  onAnchor: (year: number) => void;
  onAdd: (date?: string) => void;
  onEdit: (event: LifeEvent) => void;
  onMenu: (event: LifeEvent, mouse: MouseEvent) => void;
  hasDiary: (event: LifeEvent) => boolean;
  onDiary: (event: LifeEvent) => void;
  onWeek: (week: LifeDiaryWeek) => void;
}

export function renderLifeTimeline(options: LifePageOptions): void {
  const page = options.container.createDiv({ cls: "btl-life-page" });
  const controls = page.createDiv({ cls: "btl-life-controls" });
  const zoomOut = icon(controls, "minus", "缩小");
  const zoomIn = icon(controls, "plus", "放大");
  const todayButton = controls.createEl("button", { text: "今天", cls: "btl-life-today" });
  const scaleLabel = controls.createEl("button", { cls: "btl-life-scale-label", attr: { type: "button", "aria-label": "切换时间尺度" } });
  const today = dateKey(new Date()).slice(5);
  const rewind = options.events.filter(event => event.kind === "milestone" && event.date.length === 10 && event.date.slice(5) === today && event.date < dateKey(new Date()))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const rewindButton = rewind ? page.createEl("button", { cls: "btl-life-rewind", text: `${Number(dateKey(new Date()).slice(0, 4)) - Number(rewind.date.slice(0, 4))}年前的今天 · ${rewind.title}` }) : null;
  const scroller = page.createDiv({ cls: "btl-life-scroller" });
  const canvas = scroller.createDiv({ cls: "btl-life-canvas" });
  const range = lifeRange([...options.events, ...options.weeks.map(week => ({ id: week.path, title: week.label, date: week.date, kind: "milestone" as const }))]);
  let scale = clamp(Number(localStorage.getItem("branch-timeline-hz-life-scale")) || 48);
  let ready = false;
  let pinchDistance = 0;
  let pinchScale = scale;
  let pinchAnchorY = 0;

  const yearY = (year: number) => TOP + (year - range.first) * scale;
  const scrollToYear = (year: number, viewportY = scroller.clientHeight * 0.46) => {
    scroller.scrollTop = Math.max(0, yearY(year) - viewportY);
    options.onAnchor(year);
  };
  const centerYear = () => range.first + (scroller.scrollTop + scroller.clientHeight * 0.46 - TOP) / scale;
  const setScale = (next: number, viewportY = scroller.clientHeight * 0.46, preview = false) => {
    const target = clamp(next);
    if (Math.abs(target - scale) < 0.01) return;
    const year = range.first + (scroller.scrollTop + viewportY - TOP) / scale;
    scale = target;
    localStorage.setItem("branch-timeline-hz-life-scale", String(scale));
    if (preview) updatePositions(); else draw();
    scrollToYear(year, viewportY);
  };

  zoomOut.onclick = () => setScale(scale / 1.4);
  zoomIn.onclick = () => setScale(scale * 1.4);
  scaleLabel.onclick = () => setScale(scale < 150 ? 450 : scale < 1800 ? 5000 : 48);
  todayButton.onclick = () => scrollToYear(lifeDatePosition(dateKey(new Date())));
  if (rewind && rewindButton) rewindButton.onclick = () => { setScale(Math.max(scale, 95)); scrollToYear(lifeDatePosition(rewind.date)); };
  scroller.addEventListener("scroll", () => { if (ready) options.onAnchor(centerYear()); }, { passive: true });
  scroller.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const viewportY = event.clientY - scroller.getBoundingClientRect().top;
    setScale(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), viewportY);
  }, { passive: false });
  scroller.addEventListener("touchstart", event => {
    if (event.touches.length !== 2) return;
    pinchDistance = distance(event.touches[0], event.touches[1]);
    pinchScale = scale;
    pinchAnchorY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - scroller.getBoundingClientRect().top;
  }, { passive: true });
  scroller.addEventListener("touchmove", event => {
    if (event.touches.length !== 2 || !pinchDistance) return;
    event.preventDefault();
    setScale(pinchScale * distance(event.touches[0], event.touches[1]) / pinchDistance, pinchAnchorY, true);
  }, { passive: false });
  scroller.addEventListener("touchend", event => {
    if (event.touches.length >= 2 || !pinchDistance) return;
    pinchDistance = 0;
    const year = centerYear();
    draw();
    scrollToYear(year);
  });

  function updatePositions(): void {
    canvas.style.height = `${TOP * 2 + (range.last - range.first) * scale}px`;
    scaleLabel.setText(scale < 26 ? "十年" : scale < 150 ? "年份" : scale < 1800 ? "月份" : "周");
    for (const element of canvas.querySelectorAll<HTMLElement>("[data-life-year]")) {
      const start = Number(element.dataset.lifeYear);
      element.style.top = `${yearY(start)}px`;
      if (element.dataset.lifeEnd) element.style.height = `${Math.max(18, yearY(Number(element.dataset.lifeEnd)) - yearY(start))}px`;
    }
  }

  function draw(): void {
    canvas.empty();
    canvas.style.height = `${TOP * 2 + (range.last - range.first) * scale}px`;
    scaleLabel.setText(scale < 26 ? "十年" : scale < 150 ? "年份" : scale < 1800 ? "月份" : "周");
    const line = canvas.createDiv({ cls: "btl-life-line" });
    line.style.top = `${yearY(range.first)}px`;
    line.style.bottom = `${canvas.clientHeight ? canvas.clientHeight - yearY(range.last) : TOP}px`;
    drawChapters(canvas);
    drawTicks(canvas);
    drawWeeks(canvas);
    drawToday(canvas);
    drawEvents(canvas);
    canvas.ondblclick = event => {
      if ((event.target as HTMLElement).closest("button, .btl-life-event-card, .btl-life-chapter-head")) return;
      const rect = canvas.getBoundingClientRect();
      const year = range.first + (event.clientY - rect.top - TOP) / scale;
      options.onAdd(lifeDateAt(Math.max(range.first, Math.min(range.last, year))));
    };
  }

  function drawTicks(canvas: HTMLElement): void {
    const step = scale < 21 ? 10 : scale < 42 ? 5 : 1;
    for (let year = Math.ceil(range.first / step) * step; year <= range.last; year += step) {
      const tick = canvas.createDiv({ cls: "btl-life-tick" });
      tick.dataset.lifeYear = String(year);
      tick.style.top = `${yearY(year)}px`;
      tick.createSpan({ text: String(year) });
      if (scale >= 220) {
        for (let month = 2; month <= 12; month += 1) {
          const minor = canvas.createDiv({ cls: "btl-life-month-tick" });
          minor.dataset.lifeYear = String(lifeDatePosition(`${year}-${String(month).padStart(2, "0")}`, "start"));
          minor.style.top = `${yearY(Number(minor.dataset.lifeYear))}px`;
          minor.createSpan({ text: `${month}月` });
        }
      }
    }
  }

  function drawToday(canvas: HTMLElement): void {
    const today = new Date();
    const marker = canvas.createDiv({ cls: "btl-life-now" });
    marker.dataset.lifeYear = String(lifeDatePosition(dateKey(today)));
    marker.style.top = `${yearY(Number(marker.dataset.lifeYear))}px`;
    marker.createSpan({ text: "今天" });
  }

  function drawWeeks(canvas: HTMLElement): void {
    if (scale < 1500) return;
    for (const week of options.weeks) {
      const button = canvas.createEl("button", { cls: "btl-life-week", text: week.label, attr: { type: "button", "aria-label": `打开 ${week.label} 周记` } });
      button.dataset.lifeYear = String(lifeDatePosition(week.date, "start"));
      button.style.top = `${yearY(Number(button.dataset.lifeYear))}px`;
      button.onclick = event => { event.stopPropagation(); options.onWeek(week); };
    }
  }

  function drawChapters(canvas: HTMLElement): void {
    options.events.filter(event => event.kind === "chapter" && event.endDate).forEach((chapter, index) => {
      const start = yearY(lifeDatePosition(chapter.date, "start"));
      const end = yearY(lifeDatePosition(chapter.endDate!, "end"));
      const band = canvas.createDiv({ cls: "btl-life-chapter" });
      band.dataset.lifeYear = String(lifeDatePosition(chapter.date, "start"));
      band.dataset.lifeEnd = String(lifeDatePosition(chapter.endDate!, "end"));
      band.style.top = `${start}px`;
      band.style.height = `${Math.max(18, end - start)}px`;
      band.style.setProperty("--btl-life-color", CHAPTER_COLORS[index % CHAPTER_COLORS.length]);
      const head = band.createDiv({ cls: "btl-life-chapter-head" });
      head.setAttr("role", "button");
      head.setAttr("tabindex", "0");
      head.createSpan({ text: chapter.title });
      const more = icon(head, "ellipsis-vertical", "阶段菜单");
      more.onclick = event => { event.stopPropagation(); options.onMenu(chapter, event); };
      head.onclick = event => { if (!(event.target as HTMLElement).closest("button")) options.onEdit(chapter); };
      head.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); options.onEdit(chapter); } };
    });
  }

  function drawEvents(canvas: HTMLElement): void {
    const clusters = clusterLifeEvents(options.events, scale);
    for (const cluster of clusters) {
      const first = cluster[0];
      const position = cluster.reduce((sum, item) => sum + lifeDatePosition(item.date), 0) / cluster.length;
      const row = canvas.createDiv({ cls: "btl-life-event" });
      row.dataset.lifeYear = String(position);
      row.toggleClass("is-diary", "diaryPath" in first);
      row.style.top = `${yearY(position)}px`;
      row.createDiv({ cls: "btl-life-dot" });
      const card = row.createEl("button", { cls: "btl-life-event-card", attr: { type: "button", title: first.title } });
      card.createEl("strong", { text: first.title });
      card.createSpan({ text: cluster.length > 1 ? `${lifeDateLabel(first.date)} · +${cluster.length - 1}` : (first as LifeDiaryEntry).diaryLabel || lifeDateLabel(first.date) });
      if (scale >= 100 && first.note && cluster.length === 1) card.createEl("small", { text: first.note });
      card.onclick = () => {
        if (cluster.length === 1) { options.onEdit(first); return; }
        if (scale < MAX_SCALE / 1.5) { setScale(scale * 2, Math.max(32, Math.min(scroller.clientHeight - 32, yearY(position) - scroller.scrollTop))); return; }
        const menu = new Menu();
        for (const item of cluster) menu.addItem(entry => entry.setTitle(`${lifeDateLabel(item.date)} ${item.title}`).onClick(() => options.onEdit(item)));
        menu.showAtPosition({ x: card.getBoundingClientRect().left, y: card.getBoundingClientRect().bottom });
      };
      if (cluster.length === 1) {
        if (!("diaryPath" in first)) {
          const more = icon(row, "ellipsis-vertical", "节点菜单");
          more.onclick = event => { event.stopPropagation(); options.onMenu(first, event); };
        }
        if (options.hasDiary(first)) {
          const diary = icon(row, "book-open", "打开当周日记");
          diary.onclick = event => { event.stopPropagation(); options.onDiary(first); };
        }
      }
    }
  }

  draw();
  window.requestAnimationFrame(() => {
    if (!scroller.isConnected) return;
    scrollToYear(options.anchor ?? lifeDatePosition(dateKey(new Date())));
    ready = true;
  });
}

function icon(parent: HTMLElement, name: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", { attr: { type: "button", "aria-label": label, title: label } });
  setIcon(button, name);
  return button;
}

function clamp(scale: number): number { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale)); }
function distance(a: Touch, b: Touch): number { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

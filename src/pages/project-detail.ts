import { setIcon } from "obsidian";
import type {
  BranchTimelineState,
  ProjectRef,
  ProjectTimelineBranch
} from "../types";
import { formatTime, itemDuration } from "../timeline/model";
import { ProjectDetailGestures } from "./project-detail-gestures";
import {
  PROJECT_SCALE_MAX,
  PROJECT_SCALE_MIN,
  PROJECT_TOP,
  applyProjectLod,
  projectBranchPath
} from "./project-detail-layout";
import {
  absoluteMinute,
  dayNumber,
  isoWeekNumber,
  pickProjectBranch,
  projectBranchX,
  projectEntries,
  projectTimelineRange,
  type ProjectTimelineEntry
} from "./project-model";

const SVG_NS = "http://www.w3.org/2000/svg";
export { PROJECT_SCALE_MAX, PROJECT_SCALE_MIN } from "./project-detail-layout";

export interface ProjectScaleAnchor {
  abs: number;
  offset: number;
}

export interface ProjectDetailOptions {
  container: HTMLElement;
  project: ProjectRef;
  state: BranchTimelineState;
  focusDate: Date;
  scale: number;
  anchor?: ProjectScaleAnchor;
  onBack: () => void;
  onScale: (scale: number, anchor: ProjectScaleAnchor) => void;
  onMoveItem: (date: string, itemId: string, branchId: string | null) => void;
  onItemNote: (entry: ProjectTimelineEntry) => void;
  onItemMenu: (entry: ProjectTimelineEntry, event: MouseEvent) => void;
  onBranchMenu: (branch: ProjectTimelineBranch, event: MouseEvent) => void;
  onBranchOffset: (branchId: string, offsetX: number) => void;
  onBranchStart: (branchId: string, startAbs: number) => void;
  onBranchEnd: (branchId: string, endAbs: number, toggleMerge: boolean) => void;
  onBranchFlip: (branchId: string) => void;
  onAddTodo: (abs: number, branchId: string | null) => void;
  onAddBranch: (abs: number, side: -1 | 1) => void;
}

export interface ProjectDetailRenderResult {
  scroller: HTMLElement;
  getAnchor: () => ProjectScaleAnchor;
  destroy: () => void;
}

export function renderProjectDetail(options: ProjectDetailOptions): ProjectDetailRenderResult {
  const { container, project, state, scale } = options;
  const timeline = state.projects[project.path] || { branches: [] };
  const branches = timeline.branches;
  const entries = projectEntries(state, project.path);
  const focusDate = `${options.focusDate.getFullYear()}-${pad(options.focusDate.getMonth() + 1)}-${pad(options.focusDate.getDate())}`;
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const focusMinute = focusDate === today ? now.getHours() * 60 + now.getMinutes() : 12 * 60;
  const focusAbs = absoluteMinute(focusDate, focusMinute);
  const range = projectTimelineRange(entries, branches, focusAbs);

  const header = container.createDiv({ cls: "btl-project-detail-head" });
  const back = header.createEl("button", { cls: "btl-project-back", attr: { "aria-label": "返回" } });
  setIcon(back, "chevron-left");
  back.onclick = options.onBack;
  header.createEl("h2", { text: project.name });
  header.createSpan({ cls: "btl-project-detail-meta", text: projectMeta(state, project.path, entries.length) });

  const scroller = container.createDiv({ cls: "btl-project-detail-scroller" });
  const baseWidth = Math.max(300, scroller.clientWidth || container.clientWidth || 390);
  const gap = baseWidth <= 520 ? 104 : 150;
  const maxSide = Math.max(
    1,
    branches.filter(branch => branch.side < 0).length,
    branches.filter(branch => branch.side > 0).length
  );
  const width = Math.max(baseWidth, 126 + maxSide * gap * 2);
  const center = width / 2;
  const pxPerMinute = scale / 1440;
  const yOf = (abs: number): number => (abs - range.start) * pxPerMinute + PROJECT_TOP;
  const absAt = (clientY: number): number => {
    const rect = canvas.getBoundingClientRect();
    const raw = range.start + (clientY - rect.top - PROJECT_TOP) / pxPerMinute;
    return Math.round(raw / 15) * 15;
  };
  const height = Math.max(420, yOf(range.end) + 70);
  const canvas = scroller.createDiv({ cls: "btl-project-timeline" });
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  applyProjectLod(canvas, scale);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.addClass("btl-project-paths");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  canvas.appendChild(svg);
  const axis = canvas.createDiv({ cls: "btl-project-axis" });
  axis.style.left = `${center}px`;

  renderTicks(canvas, range.start, range.end, scale, yOf);
  renderNow(canvas, today, now, yOf, height);
  renderBranches(canvas, svg, branches, center, gap, yOf);
  renderEntries(canvas, state, entries, branches, center, gap, yOf);
  const zoom = container.createDiv({ cls: "btl-project-zoom" });
  const zoomOut = zoom.createEl("button", { text: "−", attr: { "aria-label": "缩小" } });
  const zoomIn = zoom.createEl("button", { text: "+", attr: { "aria-label": "放大" } });
  const gestures = new ProjectDetailGestures({
    ...options,
    scroller,
    canvas,
    entries,
    branches,
    center,
    gap,
    rangeStart: range.start,
    pxPerMinute,
    absAt,
    yOf
  });
  zoomOut.onclick = () => gestures.stepScale(1 / 1.6);
  zoomIn.onclick = () => gestures.stepScale(1.6);

  window.requestAnimationFrame(() => {
    const anchor = options.anchor || { abs: focusAbs, offset: scroller.clientHeight / 2 };
    scroller.scrollTop = Math.max(0, yOf(anchor.abs) - anchor.offset);
  });

  return {
    scroller,
    getAnchor: () => ({
      abs: range.start + (scroller.scrollTop + scroller.clientHeight / 2 - PROJECT_TOP) / pxPerMinute,
      offset: scroller.clientHeight / 2
    }),
    destroy: () => gestures.destroy()
  };
}

function renderTicks(
  canvas: HTMLElement,
  rangeStart: number,
  rangeEnd: number,
  scale: number,
  yOf: (abs: number) => number
): void {
  const startDay = Math.floor(rangeStart / 1440);
  const endDay = Math.ceil(rangeEnd / 1440);
  const mode = scale >= 34 ? "day" : scale >= 8 ? "week" : scale >= 1.5 ? "month" : "year";
  let lastMonth = -1;
  for (let day = startDay; day <= endDay; day++) {
    const date = new Date(day * 86_400_000);
    const monday = date.getUTCDay() === 1;
    const monthStart = date.getUTCDate() === 1;
    const yearStart = monthStart && date.getUTCMonth() === 0;
    const show = mode === "day" || (mode === "week" && monday) || (mode === "month" && monthStart) || (mode === "year" && yearStart);
    if (!show) continue;
    const top = yOf(day * 1440);
    const tick = canvas.createDiv({ cls: `btl-project-tick${monthStart || yearStart ? " is-major" : ""}` });
    tick.style.top = `${top}px`;
    const month = date.getUTCMonth() + 1;
    const label = mode === "year"
      ? String(date.getUTCFullYear())
      : mode === "month"
        ? `${month}月`
        : mode === "week"
          ? `W${pad(isoWeekNumber(day))}`
          : monthStart || month !== lastMonth ? `${month}/${date.getUTCDate()}` : String(date.getUTCDate());
    const text = canvas.createDiv({ cls: `btl-project-tick-label${monthStart || yearStart ? " is-major" : ""}`, text: label });
    text.style.top = `${top}px`;
    lastMonth = month;
  }
}

function renderNow(canvas: HTMLElement, today: string, now: Date, yOf: (abs: number) => number, height: number): void {
  const top = yOf(absoluteMinute(today, now.getHours() * 60 + now.getMinutes()));
  if (top < PROJECT_TOP || top > height) return;
  const line = canvas.createDiv({ cls: "btl-project-now" });
  line.style.top = `${top}px`;
}

function renderBranches(
  canvas: HTMLElement,
  svg: SVGSVGElement,
  branches: readonly ProjectTimelineBranch[],
  center: number,
  gap: number,
  yOf: (abs: number) => number
): void {
  for (const branch of branches) {
    const x = projectBranchX(branch.id, branches, center, gap);
    const startY = yOf(branch.startAbs);
    const endY = yOf(branch.endAbs);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", projectBranchPath(center, x, startY, endY, !!branch.merged));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", branch.color);
    path.dataset.branchId = branch.id;
    path.addClass("btl-project-branch-path");
    svg.appendChild(path);

    const label = canvas.createDiv({ cls: "btl-project-branch-label", attr: { "data-branch-id": branch.id } });
    label.style.left = `${x}px`;
    label.style.top = `${startY - 18}px`;
    label.style.color = branch.color;
    label.createSpan({ text: branch.name });
    label.createEl("button", { cls: "btl-project-branch-menu", text: "⋮", attr: { "data-branch-id": branch.id, "aria-label": "分支菜单" } });

    const start = canvas.createEl("button", { cls: "btl-project-branch-start", attr: { "data-branch-id": branch.id, "aria-label": "调整分支起点" } });
    start.style.left = `${center}px`;
    start.style.top = `${startY}px`;
    start.style.borderColor = branch.color;
    const grip = canvas.createEl("button", { cls: "btl-project-branch-grip", text: "↔", attr: { "data-branch-id": branch.id, "aria-label": "横向移动分支" } });
    grip.style.left = `${x}px`;
    grip.style.top = `${startY + 20}px`;
    const end = canvas.createEl("button", { cls: `btl-project-branch-end${branch.merged ? " is-merged" : ""}`, attr: { "data-branch-id": branch.id, "aria-label": "调整或合并分支" } });
    end.style.left = `${branch.merged ? center : x}px`;
    end.style.top = `${endY + (branch.merged ? 26 : 0)}px`;
    end.style.borderColor = branch.color;
    end.style.color = branch.color;
  }
}

function renderEntries(
  canvas: HTMLElement,
  state: BranchTimelineState,
  entries: readonly ProjectTimelineEntry[],
  branches: readonly ProjectTimelineBranch[],
  center: number,
  gap: number,
  yOf: (abs: number) => number
): void {
  const occupied = new Map<string, { left: number; right: number }>();
  for (const entry of entries) {
    const item = entry.item;
    const color = "var(--text-faint)";
    const card = canvas.createDiv({
      cls: `btl-project-item is-${item.kind}${item.milestone ? " is-milestone" : ""}`,
      attr: {
        "data-date": entry.date,
        "data-item-id": item.id,
        "data-project-branch-id": item.projectBranchId || ""
      }
    });
    card.style.left = `${projectBranchX(item.projectBranchId, branches, center, gap)}px`;
    card.style.top = `${yOf(entry.abs)}px`;
    card.style.setProperty("--btl-project-item-color", color);
    placeCompactTitle(card, item.projectBranchId || "main", yOf(entry.abs), occupied);
    if (item.milestone) {
      const flag = card.createSpan({ cls: "btl-project-milestone" });
      setIcon(flag, "flag");
    }
    card.createSpan({ cls: "btl-project-item-title", text: item.title });
    const day = state.days[entry.date];
    const duration = day ? itemDuration(item, day.wake) : 0;
    card.createSpan({
      cls: "btl-project-item-meta",
      text: `${entry.date.slice(5)} · ${formatTime(entry.abs % 1440)}${duration ? ` · ${durationLabel(duration)}` : item.kind === "fact" ? " · 事实" : " · 代办"}`
    });
    card.createSpan({ cls: "btl-project-item-compact", text: item.title });
    card.createEl("button", { cls: "btl-project-item-menu", text: "⋮", attr: { "aria-label": "事项菜单" } });
  }
}

function placeCompactTitle(card: HTMLElement, lane: string, y: number, occupied: Map<string, { left: number; right: number }>): void {
  const slots = occupied.get(lane) || { left: -Infinity, right: -Infinity };
  let side: "left" | "right" = "right";
  if (y - slots.right < 15 && y - slots.left >= 15) side = "left";
  else if (y - slots.right < 15 && y - slots.left < 15) side = slots.left < slots.right ? "left" : "right";
  slots[side] = y;
  occupied.set(lane, slots);
  card.toggleClass("compact-left", side === "left");
}

function projectMeta(state: BranchTimelineState, path: string, count: number): string {
  let minutes = 0;
  for (const day of Object.values(state.days)) {
    for (const item of day.items) if (item.projectPath === path && item.kind === "fact") minutes += itemDuration(item, day.wake);
  }
  return `${count} 项 · ${durationLabel(minutes)}`;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(minutes % 60 ? 1 : 0)}h`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

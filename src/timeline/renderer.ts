import { setIcon } from "obsidian";
import { RHYTHM_KEYS, rhythmLabel, rhythmRealKey } from "../rhythm";
import type { RhythmKey, TimelineDayState, TimelineItem, TimelineTag } from "../types";
import {
  branchPath,
  computeTimelineLayout,
  formatTime,
  itemDuration,
  itemEnd,
  itemStart,
  itemX,
  minuteToY,
  type TimelineLayout
} from "./model";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface TimelineRenderOptions {
  day: TimelineDayState;
  tags: readonly TimelineTag[];
  scale: number;
  width: number;
  nowMinute?: number;
}

export interface TimelineRenderResult {
  canvas: HTMLElement;
  layout: TimelineLayout;
}

export function applyTimelineLod(canvas: HTMLElement, scale: number): void {
  const detail = smoothstep(0.58, 1.04, scale);
  const text = smoothstep(0.64, 0.98, scale);
  canvas.style.setProperty("--btl-point-width", `${lerp(8, 108, detail)}px`);
  canvas.style.setProperty("--btl-timed-width", `${lerp(7, 150, detail)}px`);
  canvas.style.setProperty("--btl-item-radius", `${lerp(999, 8, detail)}px`);
  canvas.style.setProperty("--btl-item-padding-x", `${lerp(0, 8, detail)}px`);
  canvas.style.setProperty("--btl-item-padding-y", `${lerp(0, 5, detail)}px`);
  canvas.style.setProperty("--btl-todo-bottom", `${lerp(0, 16, detail)}px`);
  canvas.style.setProperty("--btl-item-gap", `${lerp(0, 7, detail)}px`);
  canvas.style.setProperty("--btl-head-height", `${lerp(7, 31, detail)}px`);
  canvas.style.setProperty("--btl-title-size", `${lerp(8, 11, text)}px`);
  canvas.style.setProperty("--btl-detail-opacity", String(text));
  canvas.style.setProperty("--btl-compact-opacity", String(1 - text));
  canvas.style.setProperty("--btl-menu-opacity", String(Math.max(0.12, text)));
}

export function renderTimeline(container: HTMLElement, options: TimelineRenderOptions): TimelineRenderResult {
  const { day, tags, scale, width, nowMinute } = options;
  const layout = computeTimelineLayout(day, width, scale, nowMinute);
  const canvas = container.createDiv({ cls: "btl-canvas" });
  canvas.style.height = `${layout.height}px`;
  applyTimelineLod(canvas, scale);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.addClass("btl-paths");
  svg.setAttribute("width", String(layout.width));
  svg.setAttribute("height", String(layout.height));
  canvas.appendChild(svg);
  canvas.createDiv({ cls: "btl-main-axis" });

  renderTicks(canvas, day, scale);
  renderNow(canvas, day, scale, nowMinute);
  renderRhythm(canvas, day, scale);
  renderBranches(canvas, svg, day, layout);

  const orderedItems = [...day.items].sort((a, b) => itemDuration(b, day.wake, nowMinute) - itemDuration(a, day.wake, nowMinute));
  for (const item of orderedItems) renderItem(canvas, day, layout, item, tags, nowMinute);
  return { canvas, layout };
}

function renderTicks(canvas: HTMLElement, day: TimelineDayState, scale: number): void {
  for (let minute = Math.ceil(day.wake / 60) * 60; minute <= day.sleep; minute += 60) {
    const major = minute === 12 * 60 || minute === 18 * 60;
    const mid = minute % 180 === 0;
    const tick = canvas.createDiv({ cls: `btl-canvas-tick${major ? " is-major" : mid ? " is-mid" : ""}` });
    tick.style.top = `${minuteToY(day, scale, minute)}px`;
    if (major || mid) {
      const label = canvas.createDiv({ cls: `btl-canvas-tick-label${major ? " is-major" : ""}`, text: formatTime(minute) });
      label.style.top = tick.style.top;
    }
  }
}

function renderNow(canvas: HTMLElement, day: TimelineDayState, scale: number, nowMinute?: number): void {
  if (nowMinute == null || nowMinute < day.wake || nowMinute > day.sleep) return;
  const top = minuteToY(day, scale, nowMinute);
  const line = canvas.createDiv({ cls: "btl-now-line" });
  line.style.top = `${top}px`;
  const dot = canvas.createDiv({ cls: "btl-now-dot", attr: { title: "现在" } });
  dot.style.top = `${top}px`;
}

function renderRhythm(canvas: HTMLElement, day: TimelineDayState, scale: number): void {
  for (const key of RHYTHM_KEYS) {
    const minute = day[key];
    const real = !!day[rhythmRealKey(key as RhythmKey)];
    const element = canvas.createDiv({ cls: "btl-rhythm-marker", attr: { "data-rhythm-key": key } });
    element.style.top = `${minuteToY(day, scale, minute)}px`;
    element.createSpan({ cls: `btl-rhythm-dot${real ? " is-real" : ""}` });
    element.createSpan({ text: `${rhythmLabel(key)} ${formatTime(minute)}` });
  }
}

function renderBranches(
  canvas: HTMLElement,
  svg: SVGSVGElement,
  day: TimelineDayState,
  layout: TimelineLayout
): void {
  for (const entry of layout.branches.values()) {
    const { branch } = entry;
    const color = branch.color || "#3b6ea5";
    const startY = minuteToY(day, layout.scale, branch.startMin);
    const endY = minuteToY(day, layout.scale, entry.endMin);
    const x = layout.center + entry.x;
    const path = document.createElementNS(SVG_NS, "path");
    path.addClass("btl-branch-path");
    path.dataset.branchId = branch.id;
    path.setAttribute("d", branchPath(day, layout, entry));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    svg.appendChild(path);

    const label = canvas.createDiv({ cls: "btl-branch-label", attr: { "data-branch-id": branch.id } });
    label.style.left = `${x}px`;
    label.style.top = `${startY - 17}px`;
    label.style.color = color;
    label.createSpan({ cls: "btl-branch-name", text: branch.name });
    label.createEl("button", { cls: "btl-branch-menu", text: "⋮", attr: { "aria-label": "分支菜单" } });

    const start = canvas.createDiv({ cls: "btl-branch-start", attr: { "data-branch-id": branch.id } });
    start.style.top = `${startY}px`;
    start.style.borderColor = color;
    start.dataset.time = formatTime(branch.startMin);

    const grip = canvas.createDiv({ cls: "btl-branch-grip", text: "↔", attr: { "data-branch-id": branch.id } });
    grip.style.left = `${x}px`;
    grip.style.top = `${startY + 20}px`;

    const end = canvas.createDiv({
      cls: `btl-branch-end${branch.endMin != null ? " is-merged" : ""}`,
      attr: { "data-branch-id": branch.id }
    });
    end.style.left = `${branch.endMin != null ? layout.center : x}px`;
    end.style.top = `${branch.endMin != null ? endY + 30 : endY}px`;
    end.style.borderColor = color;
    end.style.color = color;
    end.dataset.time = formatTime(entry.endMin);
  }
}

function renderItem(
  canvas: HTMLElement,
  day: TimelineDayState,
  layout: TimelineLayout,
  item: TimelineItem,
  tags: readonly TimelineTag[],
  nowMinute?: number
): void {
  const start = itemStart(item, day.wake);
  const end = itemEnd(item, day.wake, nowMinute);
  const duration = Math.max(0, end - start);
  const running = item.factTiming || (item.kind === "todo" && item.startedMin != null);
  const timed = duration > 0 && (item.kind === "fact" || running);
  const xOffset = itemX(item, layout);
  const x = layout.center + xOffset;
  const branch = item.branchId ? layout.branches.get(item.branchId)?.branch : undefined;
  const tag = item.tagId ? tags.find(candidate => candidate.id === item.tagId) : tags.find(candidate => candidate.name === item.tag);
  const color = tag?.color || branch?.color || "var(--interactive-accent)";
  const card = canvas.createDiv({
    cls: `btl-canvas-item is-${item.kind}${timed ? " is-timed" : ""}${running ? " is-running" : ""}${!branch || branch.side < 0 ? " compact-left" : ""}`,
    attr: { "data-item-id": item.id }
  });
  card.style.left = `${x}px`;
  card.style.setProperty("--btl-item-color", color);
  card.style.zIndex = String(timed ? 20 + Math.max(0, Math.floor((720 - duration) / 60)) : 36);
  if (timed) {
    const startY = minuteToY(day, layout.scale, start);
    const endY = minuteToY(day, layout.scale, end);
    card.style.top = `${startY}px`;
    card.style.height = `${Math.max(32, endY - startY)}px`;
    if (endY - startY >= 72) card.addClass("has-room");
    if (endY - startY >= 108 && item.note) card.addClass("has-note-room");
  } else {
    card.style.top = `${minuteToY(day, layout.scale, item.kind === "fact" ? end : start)}px`;
  }

  const head = timed ? card.createDiv({ cls: "btl-canvas-item-head" }) : card;
  if (item.milestone) {
    const milestone = head.createSpan({ cls: "btl-item-milestone" });
    setIcon(milestone, "flag");
  }
  if (item.kind === "todo") head.createEl("button", { cls: "btl-item-circle", attr: { "aria-label": "完成" } });
  head.createSpan({ cls: "btl-canvas-item-title", text: item.title });
  head.createEl("button", { cls: "btl-item-menu", text: "⋮", attr: { "aria-label": "事项菜单" } });

  if (timed) {
    const body = card.createDiv({ cls: "btl-canvas-item-body" });
    const project = projectName(item.projectPath);
    if (project) body.createDiv({ cls: "btl-canvas-item-project", text: `@${project}` });
    if (item.note) body.createDiv({ cls: "btl-canvas-item-note", text: item.note });
    if (tag?.name || item.tag) body.createDiv({ cls: "btl-canvas-item-tag", text: `#${tag?.name || item.tag}` });
  }

  const time = card.createDiv({
    cls: "btl-canvas-item-time",
    text: running ? `计时 ${durationLabel(duration)}` : item.kind === "todo" ? `plan: ${formatTime(start)}` : duration ? durationLabel(duration) : formatTime(end)
  });
  if (!timed) {
    const compact = card.createDiv({ cls: "btl-canvas-item-compact" });
    compact.createSpan({ text: item.title });
    const project = projectName(item.projectPath);
    if (project) compact.createSpan({ cls: "btl-canvas-item-project", text: `@${project}` });
  }

  if (timed && !running) {
    renderSpanHandle(canvas, item.id, "start", x, minuteToY(day, layout.scale, start), formatTime(start), color);
    renderSpanHandle(canvas, item.id, "end", x, minuteToY(day, layout.scale, end), formatTime(end), color);
  }
}

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function renderSpanHandle(
  canvas: HTMLElement,
  itemId: string,
  edge: "start" | "end",
  x: number,
  y: number,
  time: string,
  color: string
): void {
  const handle = canvas.createDiv({
    cls: `btl-span-handle is-${edge}`,
    attr: { "data-item-id": itemId, "data-edge": edge }
  });
  handle.style.left = `${x}px`;
  handle.style.top = `${y}px`;
  handle.style.borderColor = color;
  if (edge === "end") handle.style.background = color;
  handle.dataset.time = time;
}

function projectName(path?: string): string {
  return path?.split("/").pop()?.replace(/\.md$/, "") || "";
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const value = minutes / 60;
  return `${value.toFixed(minutes % 60 ? 1 : 0)} 小时`;
}

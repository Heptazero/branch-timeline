import { setIcon } from "obsidian";
import type {
  BranchTimelineState,
  ProjectRef,
  ProjectTimelineBranch,
  TimelineTag
} from "../types";
import { formatTime, itemDuration } from "../timeline/model";
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
const PROJECT_TOP = 52;
export const PROJECT_SCALE_MIN = 0.8;
export const PROJECT_SCALE_MAX = 900;

export interface ProjectScaleAnchor {
  abs: number;
  offset: number;
}

export interface ProjectDetailOptions {
  container: HTMLElement;
  project: ProjectRef;
  state: BranchTimelineState;
  tags: readonly TimelineTag[];
  focusDate: Date;
  scale: number;
  anchor?: ProjectScaleAnchor;
  onBack: () => void;
  onScale: (scale: number, anchor: ProjectScaleAnchor) => void;
  onMoveItem: (date: string, itemId: string, branchId: string | null) => void;
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
  renderEntries(canvas, state, entries, branches, options.tags, center, gap, yOf);
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

interface GestureOptions extends ProjectDetailOptions {
  scroller: HTMLElement;
  canvas: HTMLElement;
  entries: readonly ProjectTimelineEntry[];
  branches: readonly ProjectTimelineBranch[];
  center: number;
  gap: number;
  rangeStart: number;
  pxPerMinute: number;
  absAt: (clientY: number) => number;
  yOf: (abs: number) => number;
}

type ProjectDrag =
  | { kind: "item"; pointerId: number; entry: ProjectTimelineEntry; element: HTMLElement; x0: number; left0: number; x: number; moved: boolean }
  | { kind: "branch"; pointerId: number; branch: ProjectTimelineBranch; element: HTMLElement; x0: number; offset0: number; offset: number; moved: boolean }
  | { kind: "start" | "end"; pointerId: number; branch: ProjectTimelineBranch; element: HTMLElement; x0: number; y0: number; y: number; moved: boolean }
  | { kind: "label"; pointerId: number; branch: ProjectTimelineBranch; element: HTMLElement; x0: number; y0: number; moved: boolean };

class ProjectDetailGestures {
  private drag: ProjectDrag | null = null;
  private background: { pointerId: number; type: string; x: number; y: number; moved: boolean; timer: number } | null = null;
  private lastTap: { at: number; x: number; y: number } | null = null;
  private previewScale: number;
  private scaleTimer: number | null = null;
  private pinch: { distance: number; scale: number; next: number; y: number } | null = null;

  constructor(private options: GestureOptions) {
    this.previewScale = options.scale;
    options.canvas.addEventListener("pointerdown", this.pointerDown);
    options.canvas.addEventListener("pointermove", this.pointerMove);
    options.canvas.addEventListener("pointerup", this.pointerUp);
    options.canvas.addEventListener("pointercancel", this.pointerCancel);
    options.canvas.addEventListener("click", this.click);
    options.canvas.addEventListener("dblclick", this.doubleClick);
    options.scroller.addEventListener("wheel", this.wheel, { passive: false });
    options.scroller.addEventListener("touchstart", this.touchStart, { passive: true });
    options.scroller.addEventListener("touchmove", this.touchMove, { passive: false });
    options.scroller.addEventListener("touchend", this.touchEnd);
  }

  destroy(): void {
    this.cancelBackground();
    if (this.scaleTimer != null) window.clearTimeout(this.scaleTimer);
    const { canvas, scroller } = this.options;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointercancel", this.pointerCancel);
    canvas.removeEventListener("click", this.click);
    canvas.removeEventListener("dblclick", this.doubleClick);
    scroller.removeEventListener("wheel", this.wheel);
    scroller.removeEventListener("touchstart", this.touchStart);
    scroller.removeEventListener("touchmove", this.touchMove);
    scroller.removeEventListener("touchend", this.touchEnd);
  }

  stepScale(factor: number): void {
    const rect = this.options.scroller.getBoundingClientRect();
    this.preview(this.previewScale * factor, rect.top + rect.height / 2, true);
  }

  private pointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    const itemMenu = target.closest<HTMLElement>(".btl-project-item-menu");
    if (itemMenu) {
      event.stopPropagation();
      return;
    }
    const branchMenu = target.closest<HTMLElement>(".btl-project-branch-menu");
    if (branchMenu?.dataset.branchId) {
      event.stopPropagation();
      return;
    }
    const end = target.closest<HTMLElement>(".btl-project-branch-end");
    if (end?.dataset.branchId) return this.startEdgeDrag(event, end, "end");
    const start = target.closest<HTMLElement>(".btl-project-branch-start");
    if (start?.dataset.branchId) return this.startEdgeDrag(event, start, "start");
    const grip = target.closest<HTMLElement>(".btl-project-branch-grip");
    if (grip?.dataset.branchId) {
      const branch = this.branch(grip.dataset.branchId);
      if (!branch) return;
      this.drag = { kind: "branch", pointerId: event.pointerId, branch, element: grip, x0: event.clientX, offset0: branch.offsetX || 0, offset: branch.offsetX || 0, moved: false };
      this.capture(grip, event.pointerId);
      return;
    }
    const label = target.closest<HTMLElement>(".btl-project-branch-label");
    if (label?.dataset.branchId) {
      const branch = this.branch(label.dataset.branchId);
      if (!branch) return;
      this.drag = { kind: "label", pointerId: event.pointerId, branch, element: label, x0: event.clientX, y0: event.clientY, moved: false };
      this.capture(label, event.pointerId);
      return;
    }
    const itemElement = target.closest<HTMLElement>(".btl-project-item");
    if (itemElement) {
      const entry = this.entry(itemElement.dataset.date, itemElement.dataset.itemId);
      if (!entry) return;
      this.drag = { kind: "item", pointerId: event.pointerId, entry, element: itemElement, x0: event.clientX, left0: parseFloat(itemElement.style.left), x: parseFloat(itemElement.style.left), moved: false };
      this.capture(itemElement, event.pointerId);
      return;
    }
    this.background = {
      pointerId: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      timer: window.setTimeout(() => {
        const hold = this.background;
        if (!hold || hold.moved) return;
        this.background = null;
        this.addBranchAt(hold.x, hold.y);
      }, 550)
    };
  };

  private click = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const itemMenu = target.closest<HTMLElement>(".btl-project-item-menu");
    if (itemMenu) {
      event.preventDefault();
      event.stopPropagation();
      const itemElement = itemMenu.closest<HTMLElement>(".btl-project-item");
      const entry = this.entry(itemElement?.dataset.date, itemElement?.dataset.itemId);
      if (entry) this.options.onItemMenu(entry, event);
      return;
    }
    const branchMenu = target.closest<HTMLElement>(".btl-project-branch-menu");
    if (branchMenu?.dataset.branchId) {
      event.preventDefault();
      event.stopPropagation();
      const branch = this.branch(branchMenu.dataset.branchId);
      if (branch) this.options.onBranchMenu(branch, event);
    }
  };

  private pointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag?.pointerId === event.pointerId) {
      const dx = event.clientX - drag.x0;
      const dy = "y0" in drag ? event.clientY - drag.y0 : 0;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      if (drag.kind === "item") {
        drag.x = drag.left0 + dx;
        drag.element.style.left = `${drag.x}px`;
        drag.element.addClass("is-dragging");
      } else if (drag.kind === "branch") {
        drag.offset = Math.max(-260, Math.min(260, drag.offset0 + dx));
        this.previewBranchX(drag.branch, drag.offset);
      } else if (drag.kind === "start" || drag.kind === "end") {
        drag.y = event.clientY;
        const at = this.edgeAbs(drag, event.clientY);
        drag.element.style.top = `${this.options.yOf(at) + (drag.kind === "end" && drag.branch.merged ? 26 : 0)}px`;
        this.previewBranchPath(drag.branch, undefined, drag.kind === "start" ? at : undefined, drag.kind === "end" ? at : undefined);
        if (drag.kind === "start") {
          const label = this.options.canvas.querySelector<HTMLElement>(`.btl-project-branch-label[data-branch-id="${CSS.escape(drag.branch.id)}"]`);
          const grip = this.options.canvas.querySelector<HTMLElement>(`.btl-project-branch-grip[data-branch-id="${CSS.escape(drag.branch.id)}"]`);
          if (label) label.style.top = `${this.options.yOf(at) - 18}px`;
          if (grip) grip.style.top = `${this.options.yOf(at) + 20}px`;
        }
      }
      return;
    }
    const background = this.background;
    if (background?.pointerId === event.pointerId && Math.hypot(event.clientX - background.x, event.clientY - background.y) > 8) {
      background.moved = true;
      window.clearTimeout(background.timer);
    }
  };

  private pointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag?.pointerId === event.pointerId) {
      if (drag.kind === "item" && drag.moved) {
        const branchId = pickProjectBranch(drag.entry.abs, drag.x, this.options.branches, this.options.center, this.options.gap);
        this.options.onMoveItem(drag.entry.date, drag.entry.item.id, branchId);
      } else if (drag.kind === "branch" && drag.moved) {
        this.options.onBranchOffset(drag.branch.id, Math.round(drag.offset));
      } else if (drag.kind === "start" && drag.moved) {
        this.options.onBranchStart(drag.branch.id, Math.min(this.edgeAbs(drag, drag.y), drag.branch.endAbs - 30));
      } else if (drag.kind === "end") {
        this.options.onBranchEnd(drag.branch.id, Math.max(this.edgeAbs(drag, drag.y), drag.branch.startAbs + 30), !drag.moved);
      } else if (drag.kind === "label" && !drag.moved) {
        this.options.onBranchFlip(drag.branch.id);
      }
      this.drag = null;
      return;
    }
    const background = this.background;
    if (!background || background.pointerId !== event.pointerId) return;
    window.clearTimeout(background.timer);
    this.background = null;
    if (background.moved || background.type === "mouse") return;
    const now = Date.now();
    if (this.lastTap && now - this.lastTap.at < 360 && Math.hypot(background.x - this.lastTap.x, background.y - this.lastTap.y) < 24) {
      this.lastTap = null;
      this.addTodoAt(background.x, background.y);
    } else {
      this.lastTap = { at: now, x: background.x, y: background.y };
    }
  };

  private pointerCancel = (): void => {
    this.drag = null;
    this.cancelBackground();
  };

  private doubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest(".btl-project-item, .btl-project-branch-label, .btl-project-branch-grip, .btl-project-branch-start, .btl-project-branch-end, button")) return;
    this.addTodoAt(event.clientX, event.clientY);
  };

  private wheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.preview(this.previewScale * Math.exp(-event.deltaY * 0.01), event.clientY, false);
  };

  private touchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) return;
    this.drag = null;
    this.cancelBackground();
    this.pinch = { distance: touchDistance(event), scale: this.previewScale, next: this.previewScale, y: touchCenterY(event) };
  };

  private touchMove = (event: TouchEvent): void => {
    if (!this.pinch || event.touches.length !== 2) return;
    event.preventDefault();
    this.pinch.next = clampScale(this.pinch.scale * touchDistance(event) / this.pinch.distance);
    this.pinch.y = touchCenterY(event);
    this.preview(this.pinch.next, this.pinch.y, false, false);
  };

  private touchEnd = (): void => {
    if (!this.pinch) return;
    const pinch = this.pinch;
    this.pinch = null;
    this.commitScale(pinch.next, pinch.y);
  };

  private preview(next: number, clientY: number, immediate: boolean, schedule = true): void {
    this.previewScale = clampScale(next);
    const { scroller, canvas, scale } = this.options;
    const rect = scroller.getBoundingClientRect();
    const offset = clientY - rect.top;
    canvas.style.transformOrigin = `50% ${scroller.scrollTop + offset}px`;
    canvas.style.transform = `scaleY(${this.previewScale / scale})`;
    applyProjectLod(canvas, this.previewScale);
    if (immediate) {
      this.commitScale(this.previewScale, clientY);
      return;
    }
    if (!schedule) return;
    if (this.scaleTimer != null) window.clearTimeout(this.scaleTimer);
    this.scaleTimer = window.setTimeout(() => this.commitScale(this.previewScale, clientY), 120);
  }

  private commitScale(scale: number, clientY: number): void {
    if (this.scaleTimer != null) window.clearTimeout(this.scaleTimer);
    this.scaleTimer = null;
    const rect = this.options.scroller.getBoundingClientRect();
    const offset = clientY - rect.top;
    const abs = this.options.rangeStart + (this.options.scroller.scrollTop + offset - PROJECT_TOP) / this.options.pxPerMinute;
    this.options.onScale(scale, { abs, offset });
  }

  private startEdgeDrag(event: PointerEvent, element: HTMLElement, kind: "start" | "end"): void {
    const branch = this.branch(element.dataset.branchId);
    if (!branch) return;
    this.drag = { kind, pointerId: event.pointerId, branch, element, x0: event.clientX, y0: event.clientY, y: event.clientY, moved: false };
    this.capture(element, event.pointerId);
  }

  private edgeAbs(drag: Extract<ProjectDrag, { kind: "start" | "end" }>, clientY: number): number {
    const mergeOffset = drag.kind === "end" && drag.branch.merged ? 26 : 0;
    return this.options.absAt(clientY - mergeOffset);
  }

  private previewBranchX(branch: ProjectTimelineBranch, offset: number): void {
    const x = projectBranchX(branch.id, this.options.branches, this.options.center, this.options.gap) + offset - (branch.offsetX || 0);
    this.previewBranchPath(branch, x);
    for (const selector of [".btl-project-branch-label", ".btl-project-branch-grip"]) {
      const element = this.options.canvas.querySelector<HTMLElement>(`${selector}[data-branch-id="${CSS.escape(branch.id)}"]`);
      if (element) element.style.left = `${x}px`;
    }
    const end = this.options.canvas.querySelector<HTMLElement>(`.btl-project-branch-end[data-branch-id="${CSS.escape(branch.id)}"]`);
    if (end && !branch.merged) end.style.left = `${x}px`;
    for (const item of this.options.canvas.querySelectorAll<HTMLElement>(`.btl-project-item[data-project-branch-id="${CSS.escape(branch.id)}"]`)) item.style.left = `${x}px`;
  }

  private previewBranchPath(branch: ProjectTimelineBranch, x?: number, startAbs?: number, endAbs?: number): void {
    const path = this.options.canvas.querySelector<SVGPathElement>(`.btl-project-branch-path[data-branch-id="${CSS.escape(branch.id)}"]`);
    if (!path) return;
    path.setAttribute("d", branchPath(
      this.options.center,
      x ?? projectBranchX(branch.id, this.options.branches, this.options.center, this.options.gap),
      this.options.yOf(startAbs ?? branch.startAbs),
      this.options.yOf(endAbs ?? branch.endAbs),
      !!branch.merged
    ));
  }

  private addTodoAt(clientX: number, clientY: number): void {
    const abs = this.options.absAt(clientY);
    const rect = this.options.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const branchId = pickProjectBranch(abs, x, this.options.branches, this.options.center, this.options.gap);
    this.options.onAddTodo(abs, branchId);
  }

  private addBranchAt(clientX: number, clientY: number): void {
    const rect = this.options.canvas.getBoundingClientRect();
    this.options.onAddBranch(this.options.absAt(clientY), clientX - rect.left < this.options.center ? -1 : 1);
  }

  private branch(id?: string): ProjectTimelineBranch | undefined {
    return id ? this.options.branches.find(branch => branch.id === id) : undefined;
  }

  private entry(date?: string, id?: string): ProjectTimelineEntry | undefined {
    return this.options.entries.find(entry => entry.date === date && entry.item.id === id);
  }

  private capture(element: HTMLElement, pointerId: number): void {
    try { element.setPointerCapture(pointerId); } catch { /* View may close during capture. */ }
  }

  private cancelBackground(): void {
    if (this.background) window.clearTimeout(this.background.timer);
    this.background = null;
  }
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
    path.setAttribute("d", branchPath(center, x, startY, endY, !!branch.merged));
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
  tags: readonly TimelineTag[],
  center: number,
  gap: number,
  yOf: (abs: number) => number
): void {
  const occupied = new Map<string, { left: number; right: number }>();
  for (const entry of entries) {
    const item = entry.item;
    const tag = item.tagId ? tags.find(candidate => candidate.id === item.tagId) : tags.find(candidate => candidate.name === item.tag);
    const color = tag?.color || "var(--interactive-accent)";
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

function applyProjectLod(canvas: HTMLElement, scale: number): void {
  const detail = smoothstep(24, 220, scale);
  const text = smoothstep(38, 150, scale);
  canvas.style.setProperty("--btl-project-card-width", `${lerp(10, 138, detail)}px`);
  canvas.style.setProperty("--btl-project-card-radius", `${lerp(999, 9, detail)}px`);
  canvas.style.setProperty("--btl-project-card-padding-x", `${lerp(1, 9, detail)}px`);
  canvas.style.setProperty("--btl-project-card-padding-y", `${lerp(1, 6, detail)}px`);
  canvas.style.setProperty("--btl-project-title-opacity", String(text));
  canvas.style.setProperty("--btl-project-meta-opacity", String(smoothstep(95, 260, scale)));
  canvas.style.setProperty("--btl-project-compact-opacity", String(1 - text));
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

function branchPath(center: number, x: number, startY: number, endY: number, merged: boolean): string {
  const bend = Math.min(30, Math.max(12, (endY - startY) / 2));
  let path = `M ${center} ${startY} Q ${x} ${startY} ${x} ${startY + bend} L ${x} ${endY}`;
  if (merged) path += ` Q ${x} ${endY + 26} ${center} ${endY + 26}`;
  return path;
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

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clampScale(value: number): number {
  return Math.max(PROJECT_SCALE_MIN, Math.min(PROJECT_SCALE_MAX, value));
}

function touchDistance(event: TouchEvent): number {
  return Math.hypot(
    event.touches[0].clientX - event.touches[1].clientX,
    event.touches[0].clientY - event.touches[1].clientY
  );
}

function touchCenterY(event: TouchEvent): number {
  return (event.touches[0].clientY + event.touches[1].clientY) / 2;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

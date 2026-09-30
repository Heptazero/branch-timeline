import type { ProjectTimelineBranch } from "../types";
import { pickProjectBranch, projectBranchX, type ProjectTimelineEntry } from "./project-model";
import {
  PROJECT_TOP,
  applyProjectLod,
  clampProjectScale,
  projectBranchPath
} from "./project-detail-layout";

export interface ProjectDetailGestureOptions {
  scale: number;
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
  onScale: (scale: number, anchor: { abs: number; offset: number }) => void;
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

type ProjectDrag =
  | { kind: "item"; pointerId: number; entry: ProjectTimelineEntry; element: HTMLElement; x0: number; left0: number; x: number; moved: boolean }
  | { kind: "branch"; pointerId: number; branch: ProjectTimelineBranch; element: HTMLElement; x0: number; offset0: number; offset: number; moved: boolean }
  | { kind: "start" | "end"; pointerId: number; branch: ProjectTimelineBranch; element: HTMLElement; x0: number; y0: number; y: number; moved: boolean }
  | { kind: "label"; pointerId: number; branch: ProjectTimelineBranch; element: HTMLElement; x0: number; y0: number; moved: boolean };

export class ProjectDetailGestures {
  private drag: ProjectDrag | null = null;
  private background: { pointerId: number; type: string; x: number; y: number; moved: boolean; timer: number } | null = null;
  private lastTap: { at: number; x: number; y: number } | null = null;
  private previewScale: number;
  private scaleTimer: number | null = null;
  private pinch: { distance: number; scale: number; next: number; y: number } | null = null;

  constructor(private options: ProjectDetailGestureOptions) {
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
    if (itemMenu) { event.stopPropagation(); return; }
    const branchMenu = target.closest<HTMLElement>(".btl-project-branch-menu");
    if (branchMenu?.dataset.branchId) { event.stopPropagation(); return; }
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
      } else if (drag.kind === "item") this.options.onItemNote(drag.entry);
      else if (drag.kind === "branch" && drag.moved) this.options.onBranchOffset(drag.branch.id, Math.round(drag.offset));
      else if (drag.kind === "start" && drag.moved) this.options.onBranchStart(drag.branch.id, Math.min(this.edgeAbs(drag, drag.y), drag.branch.endAbs - 30));
      else if (drag.kind === "end") this.options.onBranchEnd(drag.branch.id, Math.max(this.edgeAbs(drag, drag.y), drag.branch.startAbs + 30), !drag.moved);
      else if (drag.kind === "label" && !drag.moved) this.options.onBranchFlip(drag.branch.id);
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
    } else this.lastTap = { at: now, x: background.x, y: background.y };
  };

  private pointerCancel = (): void => { this.drag = null; this.cancelBackground(); };

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
    this.pinch.next = clampProjectScale(this.pinch.scale * touchDistance(event) / this.pinch.distance);
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
    this.previewScale = clampProjectScale(next);
    const { scroller, canvas, scale } = this.options;
    const rect = scroller.getBoundingClientRect();
    const offset = clientY - rect.top;
    canvas.style.transformOrigin = `50% ${scroller.scrollTop + offset}px`;
    canvas.style.transform = `scaleY(${this.previewScale / scale})`;
    canvas.style.setProperty("--btl-preview-inverse", String(scale / this.previewScale));
    applyProjectLod(canvas, this.previewScale);
    if (immediate) { this.commitScale(this.previewScale, clientY); return; }
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
    path.setAttribute("d", projectBranchPath(
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
    this.options.onAddTodo(abs, pickProjectBranch(abs, x, this.options.branches, this.options.center, this.options.gap));
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

function touchDistance(event: TouchEvent): number {
  return Math.hypot(
    event.touches[0].clientX - event.touches[1].clientX,
    event.touches[0].clientY - event.touches[1].clientY
  );
}

function touchCenterY(event: TouchEvent): number {
  return (event.touches[0].clientY + event.touches[1].clientY) / 2;
}

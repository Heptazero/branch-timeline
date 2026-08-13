import type { TimelineDayState, TimelineItem } from "../types";
import {
  MAX_SCALE,
  MIN_SCALE,
  branchPath,
  branchStartBounds,
  clampMinute,
  effectiveBranchEnd,
  formatTime,
  itemEnd,
  itemStart,
  itemX,
  minuteToY,
  pickBranch,
  snapMinute,
  yToMinute,
  type TimelineLayout
} from "./model";

type RhythmKey = "wake" | "pivot" | "sleep";

export interface TimelineGestureCallbacks {
  onItemMove: (itemId: string, startMin: number, branchId: string | null) => void;
  onItemResize: (itemId: string, edge: "start" | "end", minute: number) => void;
  onItemComplete: (itemId: string) => void;
  onItemMenu: (itemId: string, event: PointerEvent) => void;
  onBranchOffset: (branchId: string, offsetX: number) => void;
  onBranchStart: (branchId: string, minute: number) => void;
  onBranchEnd: (branchId: string, minute: number | null) => void;
  onBranchFlip: (branchId: string) => void;
  onBranchMenu: (branchId: string, event: PointerEvent) => void;
  onRhythm: (key: RhythmKey, minute: number, moved: boolean) => void;
  onAddTodo: (minute: number, branchId: string | null) => void;
  onAddBranch: (minute: number) => void;
  onScale: (scale: number, anchorClientY: number, commit: boolean) => void;
}

type DragState =
  | { kind: "item"; pointerId: number; item: TimelineItem; element: HTMLElement; x0: number; y0: number; minute0: number; xOffset0: number; minute: number; xOffset: number; duration: number; moved: boolean }
  | { kind: "span"; pointerId: number; item: TimelineItem; element: HTMLElement; edge: "start" | "end"; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "branch-grip"; pointerId: number; branchId: string; element: HTMLElement; x0: number; offset0: number; offset: number; moved: boolean }
  | { kind: "branch-start"; pointerId: number; branchId: string; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "branch-end"; pointerId: number; branchId: string; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "branch-label"; pointerId: number; branchId: string; element: HTMLElement; x0: number; y0: number; moved: boolean }
  | { kind: "rhythm"; pointerId: number; key: RhythmKey; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean };

interface BackgroundPointer {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  moved: boolean;
  timer: number;
}

export class TimelineGestures {
  private drag: DragState | null = null;
  private background: BackgroundPointer | null = null;
  private lastTouchTap: { time: number; x: number; y: number } | null = null;
  private pinch: { distance: number; scale: number; nextScale: number; anchorClientY: number } | null = null;
  private previewScale: number;
  private wheelTimer: number | null = null;

  constructor(
    private scroller: HTMLElement,
    private canvas: HTMLElement,
    private day: TimelineDayState,
    private layout: TimelineLayout,
    private callbacks: TimelineGestureCallbacks
  ) {
    this.previewScale = layout.scale;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("dblclick", this.doubleClick);
    scroller.addEventListener("wheel", this.wheel, { passive: false });
    scroller.addEventListener("touchstart", this.touchStart, { passive: true });
    scroller.addEventListener("touchmove", this.touchMove, { passive: false });
    scroller.addEventListener("touchend", this.touchEnd);
  }

  destroy(): void {
    this.cancelBackground();
    if (this.wheelTimer != null) window.clearTimeout(this.wheelTimer);
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerCancel);
    this.canvas.removeEventListener("dblclick", this.doubleClick);
    this.scroller.removeEventListener("wheel", this.wheel);
    this.scroller.removeEventListener("touchstart", this.touchStart);
    this.scroller.removeEventListener("touchmove", this.touchMove);
    this.scroller.removeEventListener("touchend", this.touchEnd);
  }

  private pointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    const menu = target.closest<HTMLElement>(".btl-item-menu");
    if (menu) {
      event.preventDefault();
      event.stopPropagation();
      const itemId = menu.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      if (itemId) this.callbacks.onItemMenu(itemId, event);
      return;
    }
    const branchMenu = target.closest<HTMLElement>(".btl-branch-menu");
    if (branchMenu) {
      event.preventDefault();
      event.stopPropagation();
      const branchId = branchMenu.closest<HTMLElement>("[data-branch-id]")?.dataset.branchId;
      if (branchId) this.callbacks.onBranchMenu(branchId, event);
      return;
    }

    const span = target.closest<HTMLElement>(".btl-span-handle");
    if (span) {
      const item = this.item(span.dataset.itemId);
      const edge = span.dataset.edge === "end" ? "end" : "start";
      if (!item) return;
      const minute0 = edge === "start" ? itemStart(item, this.day.wake) : itemEnd(item, this.day.wake);
      this.drag = { kind: "span", pointerId: event.pointerId, item, element: span, edge, y0: event.clientY, minute0, minute: minute0, moved: false };
      this.capture(span, event.pointerId);
      return;
    }

    const itemElement = target.closest<HTMLElement>(".btl-canvas-item");
    if (itemElement) {
      const item = this.item(itemElement.dataset.itemId);
      if (!item) return;
      const minute0 = itemStart(item, this.day.wake);
      const xOffset0 = itemX(item, this.layout);
      this.drag = {
        kind: "item", pointerId: event.pointerId, item, element: itemElement,
        x0: event.clientX, y0: event.clientY, minute0, xOffset0,
        minute: minute0, xOffset: xOffset0, duration: Math.max(0, itemEnd(item, this.day.wake) - minute0), moved: false
      };
      this.capture(itemElement, event.pointerId);
      return;
    }

    const grip = target.closest<HTMLElement>(".btl-branch-grip");
    if (grip?.dataset.branchId) {
      const branch = this.day.branches.find(candidate => candidate.id === grip.dataset.branchId);
      if (!branch) return;
      this.drag = { kind: "branch-grip", pointerId: event.pointerId, branchId: branch.id, element: grip, x0: event.clientX, offset0: branch.offsetX || 0, offset: branch.offsetX || 0, moved: false };
      this.capture(grip, event.pointerId);
      return;
    }

    const branchStart = target.closest<HTMLElement>(".btl-branch-start");
    if (branchStart?.dataset.branchId) {
      const branch = this.day.branches.find(candidate => candidate.id === branchStart.dataset.branchId);
      if (!branch) return;
      this.drag = { kind: "branch-start", pointerId: event.pointerId, branchId: branch.id, element: branchStart, y0: event.clientY, minute0: branch.startMin, minute: branch.startMin, moved: false };
      this.capture(branchStart, event.pointerId);
      return;
    }

    const branchEnd = target.closest<HTMLElement>(".btl-branch-end");
    if (branchEnd?.dataset.branchId) {
      const branch = this.day.branches.find(candidate => candidate.id === branchEnd.dataset.branchId);
      const entry = this.layout.branches.get(branchEnd.dataset.branchId);
      if (!branch || !entry) return;
      this.drag = { kind: "branch-end", pointerId: event.pointerId, branchId: branch.id, element: branchEnd, y0: event.clientY, minute0: entry.endMin, minute: entry.endMin, moved: false };
      this.capture(branchEnd, event.pointerId);
      return;
    }

    const branchLabel = target.closest<HTMLElement>(".btl-branch-label");
    if (branchLabel?.dataset.branchId) {
      this.drag = { kind: "branch-label", pointerId: event.pointerId, branchId: branchLabel.dataset.branchId, element: branchLabel, x0: event.clientX, y0: event.clientY, moved: false };
      this.capture(branchLabel, event.pointerId);
      return;
    }

    const rhythm = target.closest<HTMLElement>(".btl-rhythm-marker");
    const rhythmKey = rhythm?.dataset.rhythmKey as RhythmKey | undefined;
    if (rhythm && rhythmKey) {
      const minute0 = this.day[rhythmKey];
      this.drag = { kind: "rhythm", pointerId: event.pointerId, key: rhythmKey, element: rhythm, y0: event.clientY, minute0, minute: minute0, moved: false };
      this.capture(rhythm, event.pointerId);
      return;
    }

    this.background = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      timer: window.setTimeout(() => {
        const active = this.background;
        if (!active || active.moved) return;
        const point = this.canvasPoint(active.x, active.y);
        this.background = null;
        this.callbacks.onAddBranch(point.minute);
      }, 550)
    };
  };

  private pointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag && drag.pointerId === event.pointerId) {
      const dx = "x0" in drag ? event.clientX - drag.x0 : 0;
      const dy = "y0" in drag ? event.clientY - drag.y0 : 0;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      drag.element.addClass("is-dragging");
      if (drag.kind === "item") this.previewItem(drag, dx, dy);
      else if (drag.kind === "span") this.previewSpan(drag, dy);
      else if (drag.kind === "branch-grip") this.previewBranchGrip(drag, dx);
      else if (drag.kind === "branch-start") this.previewBranchStart(drag, dy);
      else if (drag.kind === "branch-end") this.previewBranchEnd(drag, dy);
      else if (drag.kind === "rhythm") this.previewRhythm(drag, dy);
      return;
    }
    if (this.background && this.background.pointerId === event.pointerId && Math.hypot(event.clientX - this.background.x, event.clientY - this.background.y) > 8) {
      this.background.moved = true;
      window.clearTimeout(this.background.timer);
    }
  };

  private pointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag && drag.pointerId === event.pointerId) {
      const target = event.target as HTMLElement;
      if (drag.kind === "item") {
        if (drag.moved) this.callbacks.onItemMove(drag.item.id, snapMinute(drag.minute), pickBranch(this.layout, drag.minute, drag.xOffset));
        else if (target.closest(".btl-item-circle")) this.callbacks.onItemComplete(drag.item.id);
      } else if (drag.kind === "span" && drag.moved) {
        this.callbacks.onItemResize(drag.item.id, drag.edge, snapMinute(drag.minute));
      } else if (drag.kind === "branch-grip" && drag.moved) {
        this.callbacks.onBranchOffset(drag.branchId, Math.round(drag.offset));
      } else if (drag.kind === "branch-start" && drag.moved) {
        this.callbacks.onBranchStart(drag.branchId, snapMinute(drag.minute));
      } else if (drag.kind === "branch-end") {
        const branch = this.day.branches.find(candidate => candidate.id === drag.branchId);
        if (drag.moved) this.callbacks.onBranchEnd(drag.branchId, snapMinute(drag.minute));
        else if (branch) this.callbacks.onBranchEnd(drag.branchId, branch.endMin == null ? drag.minute0 : null);
      } else if (drag.kind === "branch-label" && !drag.moved) {
        this.callbacks.onBranchFlip(drag.branchId);
      } else if (drag.kind === "rhythm") {
        this.callbacks.onRhythm(drag.key, snapMinute(drag.minute), drag.moved);
      }
      this.drag = null;
      return;
    }

    const background = this.background;
    if (!background || background.pointerId !== event.pointerId) return;
    window.clearTimeout(background.timer);
    this.background = null;
    if (background.moved || background.pointerType === "mouse") return;
    const now = Date.now();
    const last = this.lastTouchTap;
    if (last && now - last.time < 360 && Math.hypot(background.x - last.x, background.y - last.y) < 24) {
      this.lastTouchTap = null;
      this.activateAt(background.x, background.y);
    } else {
      this.lastTouchTap = { time: now, x: background.x, y: background.y };
    }
  };

  private pointerCancel = (): void => {
    this.drag = null;
    this.cancelBackground();
  };

  private doubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest(".btl-canvas-item, .btl-rhythm-marker, .btl-branch-label, .btl-branch-grip, .btl-branch-start, .btl-branch-end, .btl-span-handle")) return;
    this.activateAt(event.clientX, event.clientY);
  };

  private wheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.previewScale = this.clampScale(this.previewScale * Math.exp(-event.deltaY * 0.01));
    this.callbacks.onScale(this.previewScale, event.clientY, false);
    if (this.wheelTimer != null) window.clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => {
      this.wheelTimer = null;
      this.callbacks.onScale(this.previewScale, event.clientY, true);
    }, 120);
  };

  private touchStart = (event: TouchEvent): void => {
    if (event.touches.length === 2) {
      this.drag = null;
      this.cancelBackground();
      this.pinch = {
        distance: touchDistance(event), scale: this.previewScale, nextScale: this.previewScale,
        anchorClientY: (event.touches[0].clientY + event.touches[1].clientY) / 2
      };
    }
  };

  private touchMove = (event: TouchEvent): void => {
    if (!this.pinch || event.touches.length !== 2) return;
    event.preventDefault();
    this.pinch.nextScale = this.clampScale(this.pinch.scale * touchDistance(event) / this.pinch.distance);
    this.pinch.anchorClientY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    this.previewScale = this.pinch.nextScale;
    this.callbacks.onScale(this.previewScale, this.pinch.anchorClientY, false);
  };

  private touchEnd = (): void => {
    const pinch = this.pinch;
    if (!pinch) return;
    this.pinch = null;
    this.callbacks.onScale(pinch.nextScale, pinch.anchorClientY, true);
  };

  private previewItem(drag: Extract<DragState, { kind: "item" }>, dx: number, dy: number): void {
    const maxStart = this.day.sleep - drag.duration;
    drag.minute = Math.max(this.day.wake, Math.min(maxStart, drag.minute0 + dy / this.layout.scale));
    drag.xOffset = drag.xOffset0 + dx;
    drag.element.style.left = `${this.layout.center + drag.xOffset}px`;
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    const startHandle = this.canvas.querySelector<HTMLElement>(`.btl-span-handle.is-start[data-item-id="${cssEscape(drag.item.id)}"]`);
    const endHandle = this.canvas.querySelector<HTMLElement>(`.btl-span-handle.is-end[data-item-id="${cssEscape(drag.item.id)}"]`);
    if (startHandle) {
      startHandle.style.left = drag.element.style.left;
      startHandle.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
      startHandle.dataset.time = formatTime(snapMinute(drag.minute));
    }
    if (endHandle) {
      endHandle.style.left = drag.element.style.left;
      endHandle.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute + drag.duration)}px`;
      endHandle.dataset.time = formatTime(snapMinute(drag.minute + drag.duration));
    }
    if (drag.item.kind === "todo") drag.element.querySelector<HTMLElement>(".btl-canvas-item-time")?.setText(`plan: ${formatTime(snapMinute(drag.minute))}`);
  }

  private previewSpan(drag: Extract<DragState, { kind: "span" }>, dy: number): void {
    const start = itemStart(drag.item, this.day.wake);
    const end = itemEnd(drag.item, this.day.wake);
    drag.minute = drag.edge === "start"
      ? Math.max(this.day.wake, Math.min(end - 5, drag.minute0 + dy / this.layout.scale))
      : Math.max(start + 5, Math.min(this.day.sleep, drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    drag.element.dataset.time = formatTime(snapMinute(drag.minute));
    const card = this.canvas.querySelector<HTMLElement>(`.btl-canvas-item[data-item-id="${cssEscape(drag.item.id)}"]`);
    if (!card) return;
    const nextStart = drag.edge === "start" ? drag.minute : start;
    const nextEnd = drag.edge === "end" ? drag.minute : end;
    card.style.top = `${minuteToY(this.day, this.layout.scale, nextStart)}px`;
    card.style.height = `${Math.max(32, (nextEnd - nextStart) * this.layout.scale)}px`;
  }

  private previewBranchGrip(drag: Extract<DragState, { kind: "branch-grip" }>, dx: number): void {
    drag.offset = Math.max(-260, Math.min(260, drag.offset0 + dx));
    const entry = this.layout.branches.get(drag.branchId);
    if (!entry) return;
    const x = entry.x + (drag.offset - drag.offset0);
    const absoluteX = this.layout.center + x;
    const path = this.canvas.querySelector<SVGPathElement>(`.btl-branch-path[data-branch-id="${cssEscape(drag.branchId)}"]`);
    path?.setAttribute("d", branchPath(this.day, this.layout, entry, x));
    for (const selector of [".btl-branch-label", ".btl-branch-grip"]) {
      const element = this.canvas.querySelector<HTMLElement>(`${selector}[data-branch-id="${cssEscape(drag.branchId)}"]`);
      if (element) element.style.left = `${absoluteX}px`;
    }
    if (entry.branch.endMin == null) {
      const end = this.canvas.querySelector<HTMLElement>(`.btl-branch-end[data-branch-id="${cssEscape(drag.branchId)}"]`);
      if (end) end.style.left = `${absoluteX}px`;
    }
    for (const item of this.day.items.filter(candidate => candidate.branchId === drag.branchId)) {
      for (const selector of [".btl-canvas-item", ".btl-span-handle.is-start", ".btl-span-handle.is-end"]) {
        const element = this.canvas.querySelector<HTMLElement>(`${selector}[data-item-id="${cssEscape(item.id)}"]`);
        if (element) element.style.left = `${absoluteX}px`;
      }
    }
  }

  private previewBranchStart(drag: Extract<DragState, { kind: "branch-start" }>, dy: number): void {
    const branch = this.day.branches.find(candidate => candidate.id === drag.branchId);
    if (!branch) return;
    const [lower, upper] = branchStartBounds(this.day, branch);
    drag.minute = Math.max(lower, Math.min(upper, drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    drag.element.dataset.time = formatTime(snapMinute(drag.minute));
  }

  private previewBranchEnd(drag: Extract<DragState, { kind: "branch-end" }>, dy: number): void {
    const branch = this.day.branches.find(candidate => candidate.id === drag.branchId);
    if (!branch) return;
    let lower = branch.startMin + 30;
    for (const item of this.day.items) if (item.branchId === branch.id) lower = Math.max(lower, itemEnd(item, this.day.wake) + 5);
    drag.minute = Math.max(lower, Math.min(this.day.sleep, drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    drag.element.dataset.time = formatTime(snapMinute(drag.minute));
  }

  private previewRhythm(drag: Extract<DragState, { kind: "rhythm" }>, dy: number): void {
    const bounds = rhythmBounds(this.day, drag.key);
    drag.minute = Math.max(bounds[0], Math.min(bounds[1], drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    const label = drag.element.lastElementChild;
    if (label) label.textContent = `${rhythmLabel(drag.key)} ${formatTime(snapMinute(drag.minute))}`;
  }

  private activateAt(clientX: number, clientY: number): void {
    const point = this.canvasPoint(clientX, clientY);
    this.callbacks.onAddTodo(point.minute, pickBranch(this.layout, point.minute, point.x));
  }

  private canvasPoint(clientX: number, clientY: number): { minute: number; x: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      minute: yToMinute(this.day, this.layout.scale, clientY - rect.top),
      x: clientX - rect.left - this.layout.center
    };
  }

  private item(id?: string): TimelineItem | undefined {
    return id ? this.day.items.find(candidate => candidate.id === id) : undefined;
  }

  private capture(element: HTMLElement, pointerId: number): void {
    try { element.setPointerCapture(pointerId); } catch { /* Pointer capture may be unavailable during teardown. */ }
  }

  private cancelBackground(): void {
    if (this.background) window.clearTimeout(this.background.timer);
    this.background = null;
  }

  private clampScale(value: number): number { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); }
}

function rhythmBounds(day: TimelineDayState, key: RhythmKey): [number, number] {
  if (key === "wake") return [0, Math.max(0, day.pivot - 30)];
  if (key === "pivot") return [day.wake + 30, day.sleep - 30];
  return [day.pivot + 30, 28 * 60];
}

function rhythmLabel(key: RhythmKey): string {
  return key === "wake" ? "起床" : key === "pivot" ? "午休" : "入睡";
}

function touchDistance(event: TouchEvent): number {
  return Math.hypot(
    event.touches[0].clientX - event.touches[1].clientX,
    event.touches[0].clientY - event.touches[1].clientY
  );
}

function cssEscape(value: string): string {
  return CSS.escape(value);
}

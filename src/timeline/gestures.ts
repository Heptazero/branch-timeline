import { rhythmMarkerMinute } from "../rhythm";
import type { RhythmBoundaryKey, RhythmKey, RhythmMarkerDefinition, TimelineDayState, TimelineEnergyPhase, TimelineItem } from "../types";
import { TimelineGesturePreview, type TimelineDragState } from "./gesture-preview";
import {
  MAX_SCALE,
  MIN_SCALE,
  clampMinute,
  effectiveBranchEnd,
  itemEnd,
  itemStart,
  itemX,
  pickBranch,
  snapMinute,
  yToMinute,
  type TimelineLayout
} from "./model";
import { updateEnergyPhasePositions } from "./renderer";

export interface TimelineGestureCallbacks {
  onItemMove: (itemId: string, startMin: number, branchId: string | null) => void;
  onItemResize: (itemId: string, edge: "start" | "end", minute: number) => void;
  onItemComplete: (itemId: string) => void;
  onItemNote: (itemId: string) => void;
  onItemMenu: (itemId: string, event: MouseEvent) => void;
  onBranchOffset: (branchId: string, offsetX: number) => void;
  onBranchStart: (branchId: string, minute: number) => void;
  onBranchEnd: (branchId: string, minute: number | null) => void;
  onBranchFlip: (branchId: string) => void;
  onBranchMenu: (branchId: string, event: MouseEvent) => void;
  onRhythm: (key: RhythmKey, minute: number, moved: boolean) => void;
  onRhythmMarker: (id: string, minute: number, moved: boolean) => void;
  onEnergyPhaseMove: (phaseId: string, minute: number) => void;
  onEnergyPhaseColor: (phaseId: string, anchor: HTMLElement) => void;
  onEnergyPhaseMenu: (phaseId: string, event: MouseEvent) => void;
  onGapBackfill: (startMinute: number, endMinute: number) => void;
  onAddTodo: (minute: number, branchId: string | null) => void;
  onAddEnergyPhase: (minute: number, side: -1 | 1) => void;
  onAddBranch: (minute: number) => void;
  onScale: (scale: number, anchorClientY: number, commit: boolean) => void;
}

interface BackgroundPointer {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  moved: boolean;
  timer: number;
}

export class TimelineGestures {
  private drag: TimelineDragState | null = null;
  private background: BackgroundPointer | null = null;
  private lastTouchTap: { time: number; x: number; y: number } | null = null;
  private pinch: { distance: number; scale: number; nextScale: number; anchorClientY: number } | null = null;
  private previewScale: number;
  private preview: TimelineGesturePreview;
  private wheelTimer: number | null = null;

  constructor(
    private scroller: HTMLElement,
    private canvas: HTMLElement,
    private day: TimelineDayState,
    private layout: TimelineLayout,
    private energyPhases: readonly TimelineEnergyPhase[],
    private rhythmMarkers: readonly RhythmMarkerDefinition[],
    private callbacks: TimelineGestureCallbacks
  ) {
    this.previewScale = layout.scale;
    this.preview = new TimelineGesturePreview(canvas, day, layout, energyPhases, rhythmMarkers);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("click", this.click);
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
    this.canvas.removeEventListener("click", this.click);
    this.canvas.removeEventListener("dblclick", this.doubleClick);
    this.scroller.removeEventListener("wheel", this.wheel);
    this.scroller.removeEventListener("touchstart", this.touchStart);
    this.scroller.removeEventListener("touchmove", this.touchMove);
    this.scroller.removeEventListener("touchend", this.touchEnd);
  }

  private pointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest(".btl-energy-color, .btl-energy-menu")) {
      event.stopPropagation();
      return;
    }
    const energyHandle = target.closest<HTMLElement>(".btl-energy-handle");
    if (energyHandle?.dataset.energyId) {
      const phase = this.energyPhases.find(candidate => candidate.id === energyHandle.dataset.energyId);
      if (!phase) return;
      event.preventDefault();
      event.stopPropagation();
      this.drag = {
        kind: "energy-phase",
        pointerId: event.pointerId,
        phaseId: phase.id,
        element: energyHandle,
        y0: event.clientY,
        minute0: phase.at,
        minute: phase.at,
        moved: false
      };
      this.capture(energyHandle, event.pointerId);
      return;
    }
    if (target.closest(".btl-energy-label")) {
      event.stopPropagation();
      return;
    }
    if (target.closest(".btl-gap-action")) {
      event.stopPropagation();
      return;
    }
    const complete = target.closest<HTMLElement>(".btl-item-circle");
    if (complete) {
      event.stopPropagation();
      return;
    }
    const menu = target.closest<HTMLElement>(".btl-item-menu");
    if (menu) {
      event.stopPropagation();
      return;
    }
    const branchMenu = target.closest<HTMLElement>(".btl-branch-menu");
    if (branchMenu) {
      event.stopPropagation();
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
    const rhythmKey = rhythm?.dataset.rhythmKey as RhythmBoundaryKey | undefined;
    if (rhythm && rhythmKey) {
      const minute0 = this.day[rhythmKey];
      this.drag = { kind: "rhythm", pointerId: event.pointerId, key: rhythmKey, element: rhythm, y0: event.clientY, minute0, minute: minute0, moved: false };
      this.capture(rhythm, event.pointerId);
      return;
    }
    const rhythmId = rhythm?.dataset.rhythmId;
    const definition = this.rhythmMarkers.find(marker => marker.id === rhythmId);
    if (rhythm && rhythmId && definition) {
      const minute0 = rhythmMarkerMinute(this.day, definition);
      this.drag = { kind: "rhythm-marker", pointerId: event.pointerId, id: rhythmId, name: definition.name,
        element: rhythm, y0: event.clientY, minute0, minute: minute0, moved: false };
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

  private click = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const energyColor = target.closest<HTMLElement>(".btl-energy-color");
    if (energyColor) {
      event.preventDefault();
      event.stopPropagation();
      const phaseId = energyColor.closest<HTMLElement>("[data-energy-id]")?.dataset.energyId;
      if (phaseId) this.callbacks.onEnergyPhaseColor(phaseId, energyColor);
      return;
    }
    const energyMenu = target.closest<HTMLElement>(".btl-energy-menu");
    if (energyMenu) {
      event.preventDefault();
      event.stopPropagation();
      const phaseId = energyMenu.closest<HTMLElement>("[data-energy-id]")?.dataset.energyId;
      if (phaseId) this.callbacks.onEnergyPhaseMenu(phaseId, event);
      return;
    }
    const gap = target.closest<HTMLElement>(".btl-gap-action");
    if (gap) {
      event.preventDefault();
      event.stopPropagation();
      const start = Number(gap.dataset.gapStart);
      const end = Number(gap.dataset.gapEnd);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) this.callbacks.onGapBackfill(start, end);
      return;
    }
    const complete = target.closest<HTMLElement>(".btl-item-circle");
    if (complete) {
      event.preventDefault();
      event.stopPropagation();
      const itemId = complete.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      if (itemId) this.callbacks.onItemComplete(itemId);
      return;
    }
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
    }
  };

  private pointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag && drag.pointerId === event.pointerId) {
      const dx = "x0" in drag ? event.clientX - drag.x0 : 0;
      const dy = "y0" in drag ? event.clientY - drag.y0 : 0;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      drag.element.addClass("is-dragging");
      if (drag.kind === "item") this.preview.item(drag, dx, dy);
      else if (drag.kind === "span") this.preview.span(drag, dy);
      else if (drag.kind === "branch-grip") this.preview.branchGrip(drag, dx);
      else if (drag.kind === "branch-start") this.preview.branchStart(drag, dy);
      else if (drag.kind === "branch-end") this.preview.branchEnd(drag, dy);
      else if (drag.kind === "rhythm") this.preview.rhythm(drag, dy);
      else if (drag.kind === "rhythm-marker") this.preview.rhythmMarker(drag, dy);
      else if (drag.kind === "energy-phase") this.preview.energyPhase(drag, dy);
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
      if (drag.kind === "item") {
        if (drag.moved) this.callbacks.onItemMove(drag.item.id, snapMinute(drag.minute), pickBranch(this.layout, drag.minute, drag.xOffset));
        else this.callbacks.onItemNote(drag.item.id);
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
      } else if (drag.kind === "rhythm-marker") {
        this.callbacks.onRhythmMarker(drag.id, snapMinute(drag.minute), drag.moved);
      } else if (drag.kind === "energy-phase" && drag.moved) {
        this.callbacks.onEnergyPhaseMove(drag.phaseId, snapMinute(drag.minute));
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
    const drag = this.drag;
    if (drag?.kind === "energy-phase") {
      const restored = this.energyPhases.map(phase => phase.id === drag.phaseId ? { ...phase, at: drag.minute0 } : phase);
      updateEnergyPhasePositions(this.canvas, this.day, this.layout.scale, restored);
      drag.element.removeClass("is-dragging");
    }
    this.drag = null;
    this.cancelBackground();
  };

  private doubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest(".btl-canvas-item, .btl-gap-action, .btl-rhythm-marker, .btl-energy-label, .btl-energy-handle, .btl-branch-label, .btl-branch-grip, .btl-branch-start, .btl-branch-end, .btl-span-handle")) return;
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

  private activateAt(clientX: number, clientY: number): void {
    const point = this.canvasPoint(clientX, clientY);
    if (Math.abs(point.x) > Math.min(110, this.canvas.clientWidth * 0.24)) {
      this.callbacks.onAddEnergyPhase(clampMinute(this.day, point.minute), point.x < 0 ? -1 : 1);
      return;
    }
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

function touchDistance(event: TouchEvent): number {
  return Math.hypot(
    event.touches[0].clientX - event.touches[1].clientX,
    event.touches[0].clientY - event.touches[1].clientY
  );
}

function cssEscape(value: string): string {
  return CSS.escape(value);
}

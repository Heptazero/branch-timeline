import { rhythmBoundaryBounds, rhythmLabel, rhythmMarkerBounds, rhythmMarkerMinute } from "../rhythm";
import type { RhythmBoundaryKey, RhythmMarkerDefinition, TimelineDayState, TimelineEnergyPhase, TimelineItem } from "../types";
import { energyPhaseBounds } from "./energy-phases";
import {
  branchPath,
  branchStartBounds,
  formatTime,
  itemEnd,
  itemStart,
  minuteToY,
  snapMinute,
  type TimelineLayout
} from "./model";
import { updateEnergyPhasePositions } from "./renderer";

export type TimelineDragState =
  | { kind: "item"; pointerId: number; item: TimelineItem; element: HTMLElement; x0: number; y0: number; minute0: number; xOffset0: number; minute: number; xOffset: number; duration: number; moved: boolean }
  | { kind: "span"; pointerId: number; item: TimelineItem; element: HTMLElement; edge: "start" | "end"; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "branch-grip"; pointerId: number; branchId: string; element: HTMLElement; x0: number; offset0: number; offset: number; moved: boolean }
  | { kind: "branch-start"; pointerId: number; branchId: string; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "branch-end"; pointerId: number; branchId: string; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "branch-label"; pointerId: number; branchId: string; element: HTMLElement; x0: number; y0: number; moved: boolean }
  | { kind: "rhythm"; pointerId: number; key: RhythmBoundaryKey; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "rhythm-marker"; pointerId: number; id: string; name: string; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean }
  | { kind: "energy-phase"; pointerId: number; phaseId: string; element: HTMLElement; y0: number; minute0: number; minute: number; moved: boolean };

export class TimelineGesturePreview {
  constructor(
    private canvas: HTMLElement,
    private day: TimelineDayState,
    private layout: TimelineLayout,
    private energyPhases: readonly TimelineEnergyPhase[],
    private rhythmMarkers: readonly RhythmMarkerDefinition[]
  ) {}

  item(drag: Extract<TimelineDragState, { kind: "item" }>, dx: number, dy: number): void {
    const maxStart = this.day.sleep - drag.duration;
    drag.minute = Math.max(this.day.wake, Math.min(maxStart, drag.minute0 + dy / this.layout.scale));
    drag.xOffset = drag.xOffset0 + dx;
    drag.element.style.left = `${this.layout.center + drag.xOffset}px`;
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    const startHandle = this.canvas.querySelector<HTMLElement>(`.btl-span-handle.is-start[data-item-id="${CSS.escape(drag.item.id)}"]`);
    const endHandle = this.canvas.querySelector<HTMLElement>(`.btl-span-handle.is-end[data-item-id="${CSS.escape(drag.item.id)}"]`);
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

  span(drag: Extract<TimelineDragState, { kind: "span" }>, dy: number): void {
    const start = itemStart(drag.item, this.day.wake);
    const end = itemEnd(drag.item, this.day.wake);
    drag.minute = drag.edge === "start"
      ? Math.max(this.day.wake, Math.min(end - 5, drag.minute0 + dy / this.layout.scale))
      : Math.max(start + 5, Math.min(this.day.sleep, drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    drag.element.dataset.time = formatTime(snapMinute(drag.minute));
    const card = this.canvas.querySelector<HTMLElement>(`.btl-canvas-item[data-item-id="${CSS.escape(drag.item.id)}"]`);
    if (!card) return;
    const nextStart = drag.edge === "start" ? drag.minute : start;
    const nextEnd = drag.edge === "end" ? drag.minute : end;
    card.style.top = `${minuteToY(this.day, this.layout.scale, nextStart)}px`;
    card.style.height = `${Math.max(32, (nextEnd - nextStart) * this.layout.scale)}px`;
  }

  branchGrip(drag: Extract<TimelineDragState, { kind: "branch-grip" }>, dx: number): void {
    drag.offset = Math.max(-260, Math.min(260, drag.offset0 + dx));
    const entry = this.layout.branches.get(drag.branchId);
    if (!entry) return;
    const x = entry.x + (drag.offset - drag.offset0);
    const absoluteX = this.layout.center + x;
    const escaped = CSS.escape(drag.branchId);
    this.canvas.querySelector<SVGPathElement>(`.btl-branch-path[data-branch-id="${escaped}"]`)
      ?.setAttribute("d", branchPath(this.day, this.layout, entry, x));
    for (const selector of [".btl-branch-label", ".btl-branch-grip"]) {
      const element = this.canvas.querySelector<HTMLElement>(`${selector}[data-branch-id="${escaped}"]`);
      if (element) element.style.left = `${absoluteX}px`;
    }
    if (entry.branch.endMin == null) {
      const end = this.canvas.querySelector<HTMLElement>(`.btl-branch-end[data-branch-id="${escaped}"]`);
      if (end) end.style.left = `${absoluteX}px`;
    }
    for (const item of this.day.items.filter(candidate => candidate.branchId === drag.branchId)) {
      for (const selector of [".btl-canvas-item", ".btl-span-handle.is-start", ".btl-span-handle.is-end"]) {
        const element = this.canvas.querySelector<HTMLElement>(`${selector}[data-item-id="${CSS.escape(item.id)}"]`);
        if (element) element.style.left = `${absoluteX}px`;
      }
    }
  }

  branchStart(drag: Extract<TimelineDragState, { kind: "branch-start" }>, dy: number): void {
    const branch = this.day.branches.find(candidate => candidate.id === drag.branchId);
    if (!branch) return;
    const [lower, upper] = branchStartBounds(this.day, branch);
    drag.minute = Math.max(lower, Math.min(upper, drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    drag.element.dataset.time = formatTime(snapMinute(drag.minute));
  }

  branchEnd(drag: Extract<TimelineDragState, { kind: "branch-end" }>, dy: number): void {
    const branch = this.day.branches.find(candidate => candidate.id === drag.branchId);
    if (!branch) return;
    let lower = branch.startMin + 30;
    for (const item of this.day.items) if (item.branchId === branch.id) lower = Math.max(lower, itemEnd(item, this.day.wake) + 5);
    drag.minute = Math.max(lower, Math.min(this.day.sleep, drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    drag.element.dataset.time = formatTime(snapMinute(drag.minute));
  }

  rhythm(drag: Extract<TimelineDragState, { kind: "rhythm" }>, dy: number): void {
    const effectiveMarkers = this.rhythmMarkers.map(marker => ({ ...marker, minute: rhythmMarkerMinute(this.day, marker) }));
    const bounds = rhythmBoundaryBounds(this.day, drag.key, effectiveMarkers);
    drag.minute = Math.max(bounds[0], Math.min(bounds[1], drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    const label = drag.element.lastElementChild;
    if (label) label.textContent = `${rhythmLabel(drag.key)} ${formatTime(snapMinute(drag.minute))}`;
  }

  rhythmMarker(drag: Extract<TimelineDragState, { kind: "rhythm-marker" }>, dy: number): void {
    const bounds = rhythmMarkerBounds(this.day, this.rhythmMarkers, drag.id);
    drag.minute = Math.max(bounds[0], Math.min(bounds[1], drag.minute0 + dy / this.layout.scale));
    drag.element.style.top = `${minuteToY(this.day, this.layout.scale, drag.minute)}px`;
    const label = drag.element.lastElementChild;
    if (label) label.textContent = `${drag.name} ${formatTime(snapMinute(drag.minute))}`;
  }

  energyPhase(drag: Extract<TimelineDragState, { kind: "energy-phase" }>, dy: number): void {
    const bounds = energyPhaseBounds(this.energyPhases, drag.phaseId, this.day.wake, this.day.sleep);
    drag.minute = Math.max(bounds[0], Math.min(bounds[1], snapMinute(drag.minute0 + dy / this.layout.scale)));
    const preview = this.energyPhases.map(phase => phase.id === drag.phaseId ? { ...phase, at: drag.minute } : phase);
    updateEnergyPhasePositions(this.canvas, this.day, this.layout.scale, preview);
  }
}

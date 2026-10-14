import { distractionLabel, distractionLevel } from "../focus-events";
import { focusRhythmColor } from "../focus-rhythm-color";
import type { TimelineDayState } from "../types";
import { formatTime, minuteToY } from "./model";

export function renderFocusMarkers(
  canvas: HTMLElement,
  day: TimelineDayState,
  scale: number,
  onMentalStateMenu?: (id: string, event: MouseEvent) => void
): void {
  for (const event of day.distractions || []) {
    const label = `${distractionLabel(event)} · ${formatTime(event.minute)}`;
    const dot = canvas.createDiv({
      cls: `btl-focus-dot is-distraction is-${distractionLevel(event)}`,
      attr: { title: label, "aria-label": label }
    });
    dot.style.top = `${minuteToY(day, scale, event.minute)}px`;
  }
  for (const event of day.goodStates || []) {
    const label = `状态顺畅 · ${formatTime(event.minute)}`;
    const dot = canvas.createDiv({ cls: "btl-focus-dot is-good", attr: { title: label, "aria-label": label } });
    dot.style.top = `${minuteToY(day, scale, event.minute)}px`;
  }
  for (const event of day.mentalStates || []) {
    const label = `${event.label || "可用脑力"} · ${event.score}/100 · ${formatTime(event.minute)}`;
    const dot = canvas.createEl("button", {
      cls: "btl-focus-dot is-mental",
      attr: { type: "button", title: `${label} · 点击管理`, "aria-label": `${label}，点击管理` }
    });
    dot.style.top = `${minuteToY(day, scale, event.minute)}px`;
    dot.style.setProperty("--btl-state-color", focusRhythmColor(event.score / 100));
    dot.addEventListener("pointerdown", pointer => pointer.stopPropagation());
    dot.onclick = pointer => { pointer.stopPropagation(); onMentalStateMenu?.(event.id, pointer); };
  }
}

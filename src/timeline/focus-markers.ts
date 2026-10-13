import { distractionLabel, distractionLevel } from "../focus-events";
import { focusRhythmColor } from "../focus-rhythm-color";
import type { TimelineDayState } from "../types";
import { formatTime, minuteToY } from "./model";

export function renderFocusMarkers(canvas: HTMLElement, day: TimelineDayState, scale: number): void {
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
  for (const event of day.discomforts || []) {
    const label = `脑不适 · ${formatTime(event.minute)}`;
    const dot = canvas.createDiv({ cls: "btl-focus-dot is-discomfort", attr: { title: label, "aria-label": label } });
    dot.style.top = `${minuteToY(day, scale, event.minute)}px`;
  }
  for (const event of day.mentalStates || []) {
    const label = `${event.label || "可用脑力"} · ${event.score}/100 · ${formatTime(event.minute)}`;
    const dot = canvas.createDiv({ cls: "btl-focus-dot is-mental", attr: { title: label, "aria-label": label } });
    dot.style.top = `${minuteToY(day, scale, event.minute)}px`;
    dot.style.background = focusRhythmColor(event.score / 100);
  }
}

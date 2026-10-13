import { focusRhythmColor } from "../focus-rhythm-color";
import type { TimelineDayState } from "../types";
import { minuteToY } from "./model";

export function renderFocusRhythmRail(
  canvas: HTMLElement,
  day: TimelineDayState,
  scale: number,
  values: readonly (number | null)[],
  nowMinute?: number
): void {
  const rail = canvas.createDiv({ cls: "btl-focus-rhythm-rail", attr: { "aria-label": "近 28 天状态记录：蓝色顺畅，红色走神" } });
  const end = Math.max(day.sleep, nowMinute ?? day.sleep);
  for (let hour = Math.floor(day.wake / 60) * 60; hour < end; hour += 60) {
    const start = Math.max(day.wake, hour);
    const stop = Math.min(end, hour + 60);
    const score = values[Math.floor(hour / 60) % 24];
    if (score == null || stop <= start) continue;
    const next = values[(Math.floor(hour / 60) + 1) % 24];
    const segment = rail.createSpan();
    segment.style.top = `${minuteToY(day, scale, start)}px`;
    segment.style.height = `${(stop - start) * scale}px`;
    segment.style.background = `linear-gradient(${focusRhythmColor(score)}, ${focusRhythmColor(next ?? score)})`;
  }
}

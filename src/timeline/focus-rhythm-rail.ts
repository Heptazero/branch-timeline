import { focusRhythmColor } from "../focus-rhythm-color";
import { focusRailMarks } from "../focus-state-model";
import type { TimelineDayState } from "../types";
import { minuteToY } from "./model";

export function renderFocusRhythmRail(
  canvas: HTMLElement,
  day: TimelineDayState,
  scale: number
): void {
  const rail = canvas.createDiv({ cls: "btl-focus-rhythm-rail", attr: { "aria-label": "当日可用脑力：灰色未记录，彩色短线为主动记录" } });
  for (const mark of focusRailMarks(day)) {
    const notch = rail.createSpan({ cls: "btl-focus-rhythm-notch", attr: { title: `${mark.label} · ${mark.score}/100` } });
    notch.style.top = `${minuteToY(day, scale, mark.minute)}px`;
    notch.style.background = focusRhythmColor(mark.score / 100);
  }
}

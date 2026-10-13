import { focusRhythmColor } from "../focus-rhythm-color";
import { projectFocusSpans } from "../focus-state-model";
import type { TimelineDayState } from "../types";
import { minuteToY } from "./model";

export function renderFocusRhythmRail(
  canvas: HTMLElement,
  day: TimelineDayState,
  scale: number,
  nowMinute?: number
): void {
  const rail = canvas.createDiv({ cls: "btl-focus-rhythm-rail", attr: { "aria-label": "当日可用脑力：中蓝为项目记录，彩色短线为手动状态" } });
  for (const { start, end } of projectFocusSpans(day, nowMinute)) {
    const segment = rail.createSpan();
    segment.style.top = `${minuteToY(day, scale, start)}px`;
    segment.style.height = `${(end - start) * scale}px`;
    segment.style.background = focusRhythmColor(.72);
    segment.title = "项目记录 · 通常投入";
  }
  const marks = [
    ...(day.distractions || []).map(event => ({ minute: event.minute, score: 0, label: "走神" })),
    ...(day.goodStates || []).map(event => ({ minute: event.minute, score: 100, label: "高度专注" })),
    ...(day.mentalStates || []).map(event => ({ minute: event.minute, score: event.score, label: event.label || "可用脑力" }))
  ];
  for (const mark of marks) {
    const notch = rail.createSpan({ cls: "btl-focus-rhythm-notch", attr: { title: `${mark.label} · ${mark.score}/100` } });
    notch.style.top = `${minuteToY(day, scale, mark.minute)}px`;
    notch.style.background = focusRhythmColor(mark.score / 100);
  }
}

import { focusRhythmColor } from "../focus-rhythm-color";
import { focusPredictionGradient } from "../focus-prediction-gradient";
import type { FocusPrediction } from "../focus-prediction";
import { focusRailMarks } from "../focus-state-model";
import type { TimelineDayState } from "../types";
import { minuteToY } from "./model";

export function renderFocusRhythmRail(
  canvas: HTMLElement,
  day: TimelineDayState,
  scale: number,
  prediction: FocusPrediction | undefined
): void {
  const gradient = prediction ? focusPredictionGradient(prediction, day.wake, day.sleep) : null;
  const rail = canvas.createDiv({ cls: "btl-focus-rhythm-rail", attr: {
    "aria-label": "历史记录推算的日内专注倾向；短线为当日记录",
    title: gradient ? "多天记录推算 · 彩线为倾向，短线为当日记录" : "正在积累记录 · 灰线表示尚无可靠预测"
  } });
  if (gradient) {
    const forecast = rail.createSpan({ cls: "btl-focus-rhythm-forecast" });
    forecast.style.top = `${minuteToY(day, scale, day.wake)}px`;
    forecast.style.height = `${(day.sleep - day.wake) * scale}px`;
    forecast.style.background = gradient;
  }
  for (const mark of focusRailMarks(day)) {
    const notch = rail.createSpan({ cls: "btl-focus-rhythm-notch", attr: { title: `${mark.label} · ${mark.score}/100` } });
    notch.style.top = `${minuteToY(day, scale, mark.minute)}px`;
    notch.style.background = focusRhythmColor(mark.score / 100);
  }
}

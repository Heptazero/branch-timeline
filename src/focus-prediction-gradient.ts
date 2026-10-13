import { focusRhythmColor } from "./focus-rhythm-color";
import type { FocusPrediction, FocusPredictionPoint } from "./focus-prediction";

/** The same curve is used by the day timeline and the statistics time map. */
export function focusPredictionGradient(prediction: FocusPrediction, start: number, end: number): string | null {
  if (end <= start || !prediction.points.some(point => point.ready && point.minute >= start && point.minute <= end)) return null;
  const visible = prediction.points.filter(point => point.minute > start && point.minute < end);
  const points = [sample(prediction.points, start), ...visible, sample(prediction.points, end)];
  const stops = points.map(point => {
    const position = ((point.minute - start) / (end - start) * 100).toFixed(2);
    const color = focusRhythmColor(point.ready ? point.score : .5);
    return `${color} ${position}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function sample(points: readonly FocusPredictionPoint[], minute: number): FocusPredictionPoint {
  const before = [...points].reverse().find(point => point.minute <= minute);
  const after = points.find(point => point.minute >= minute);
  if (!before || !after) return { minute, score: .5, evidenceDays: 0, ready: false };
  const mix = after.minute === before.minute ? 0 : (minute - before.minute) / (after.minute - before.minute);
  return { minute, score: before.score + (after.score - before.score) * mix,
    evidenceDays: Math.min(before.evidenceDays, after.evidenceDays), ready: before.ready && after.ready };
}

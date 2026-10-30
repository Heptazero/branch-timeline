import { predictFocusByTime, type FocusPrediction } from "../focus-prediction";
import { focusPredictionDisplayScore } from "../focus-prediction-gradient";
import { normalizeFocusColors } from "../focus-rhythm-color";
import { distractionLabel, distractionLevel } from "../focus-events";
import { effectiveEnergyPhases } from "../timeline/energy-phases";
import { timelineGaps } from "../timeline/model";
import type { BranchTimelineSettings, TimelineDayState, FocusColors } from "../types";

let historySignature = "";
const predictions = new Map<string, FocusPrediction>();
/** Cache only the last source history; active timer checkpoints never invalidate it. */
export function predictionsForDates(days: Record<string, TimelineDayState>, dates: string[], today?: string): Map<string, FocusPrediction> {
  const history = today ? Object.fromEntries(Object.entries(days).filter(([date]) => date < today)) : days;
  const signature = JSON.stringify(history);
  if (signature !== historySignature) { predictions.clear(); historySignature = signature; }
  const result = new Map<string, FocusPrediction>();
  for (const date of dates) {
    let prediction = predictions.get(date);
    if (!prediction) {
      prediction = predictFocusByTime(history, date);
      if (predictions.size >= 40) predictions.delete(predictions.keys().next().value!);
      predictions.set(date, prediction);
    }
    result.set(date, prediction);
  }
  return result;
}
export function focusColor(score: number, colors: FocusColors): string {
  const value = Math.max(0, Math.min(1, score)), first = value < .5 ? colors.low : colors.neutral, last = value < .5 ? colors.neutral : colors.high;
  const mix = value < .5 ? value * 2 : (value - .5) * 2;
  const rgb = (color: string) => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  return "#" + rgb(first).map((channel, index) => Math.round(channel + (rgb(last)[index] - channel) * mix).toString(16).padStart(2, "0")).join("");
}
export function projectFocusContext(days: Record<string, TimelineDayState>, date: string, settings: BranchTimelineSettings, today: string, minute: number,
  prediction: FocusPrediction, activeID?: string) {
  const day = days[date] || { ...settings.rhythm, branches: [], items: [] }, colors = normalizeFocusColors(settings.focusColors);
  const mark = (kind: string, event: { id: string; minute: number; itemId?: string }, score: number, label: string, level?: string) => ({
    id: kind + ":" + event.id, recordId: event.id, kind, minute: event.minute, score, label, level,
    color: focusColor(score / 100, colors), revision: JSON.stringify(event),
    editable: !event.itemId?.startsWith(`desktop-${activeID}-`)
  });
  const marks = [
    ...(day.distractions || []).map(event => mark("distraction", event, 0, distractionLabel(event), distractionLevel(event))),
    ...(day.goodStates || []).map(event => mark("good", event, 100, "高度专注")),
    ...(day.mentalStates || []).map(event => mark("mental", event, event.score, event.label || "可用脑力"))
  ].filter(event => event.minute >= 120 && event.minute <= 1560).sort((a, b) => a.minute - b.minute);
  const phases = effectiveEnergyPhases(days, date);
  const horizon = date < today ? Math.min(1560, day.sleep) : date === today ? minute : 120;
  return { marks, phases, energyRevision: JSON.stringify(phases), colors, labels: settings.mentalStateLabels,
    forecast: prediction.points.filter(point => point.minute >= 120 && point.minute <= 1560).map(point => ({ ...point,
      color: focusColor(point.ready ? focusPredictionDisplayScore(point.score) : .5, colors) })),
    gaps: timelineGaps(day, horizon, date === today ? minute : undefined, 10) };
}

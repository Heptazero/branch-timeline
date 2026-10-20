import { setIcon } from "obsidian";
import type { BranchTimelineState } from "../types";
import { sleepWeekMetrics } from "./sleep-summary-model";
import { timeMapTogglePresentation } from "./stats-navigation";

export function renderSleepSummary(
  parent: HTMLElement,
  dates: readonly Date[],
  state: BranchTimelineState,
  onToggleTimeMap: () => void
): { setTimeMapExpanded: (expanded: boolean) => void } {
  const section = parent.createDiv({ cls: "btl-sleep-summary", attr: { "aria-label": "本周睡眠" } });
  const heading = section.createDiv({ cls: "btl-sleep-summary-heading" });
  heading.createEl("strong", { text: "睡眠" });
  const detail = heading.createEl("button", { cls: "btl-sleep-summary-detail", attr: { type: "button" } });
  const label = detail.createSpan();
  const icon = detail.createSpan();
  const setTimeMapExpanded = (expanded: boolean): void => {
    const presentation = timeMapTogglePresentation(expanded);
    label.setText(presentation.text);
    detail.setAttribute("aria-label", presentation.label);
    detail.setAttribute("aria-expanded", presentation.expanded);
    setIcon(icon, presentation.icon);
  };
  setTimeMapExpanded(false);
  detail.onclick = event => { event.stopPropagation(); onToggleTimeMap(); };
  const metrics = section.createDiv({ cls: "btl-sleep-summary-metrics" });
  for (const metric of sleepWeekMetrics(dates, state)) {
    const tile = metrics.createDiv({ cls: "btl-sleep-summary-metric" });
    tile.createSpan({ cls: "btl-sleep-summary-label", text: metric.label });
    tile.createEl("strong", { text: metric.value });
    if (metric.change) tile.createSpan({ cls: "btl-sleep-summary-change " + metric.change.tone, text: metric.change.text,
      attr: { title: "较上周 " + metric.change.text, "aria-label": "较上周 " + metric.change.text } });
  }
  return { setTimeMapExpanded };
}

import { setIcon } from "obsidian";
import type { BranchTimelineState } from "../types";
import { sleepWeekMetrics } from "./sleep-summary-model";

export function renderSleepSummary(parent: HTMLElement, dates: readonly Date[], state: BranchTimelineState, onOpenTimeMap: () => void): void {
  const section = parent.createDiv({ cls: "btl-sleep-summary", attr: { "aria-label": "本周睡眠" } });
  const heading = section.createDiv({ cls: "btl-sleep-summary-heading" });
  heading.createEl("strong", { text: "睡眠" });
  const detail = heading.createEl("button", { cls: "btl-sleep-summary-detail", attr: { type: "button", "aria-label": "查看一周时间图" } });
  detail.createSpan({ text: "时间图" });
  setIcon(detail.createSpan(), "chevron-right");
  detail.onclick = event => { event.stopPropagation(); onOpenTimeMap(); };
  const metrics = section.createDiv({ cls: "btl-sleep-summary-metrics" });
  for (const metric of sleepWeekMetrics(dates, state)) {
    const tile = metrics.createDiv({ cls: "btl-sleep-summary-metric" });
    tile.createSpan({ cls: "btl-sleep-summary-label", text: metric.label });
    tile.createEl("strong", { text: metric.value });
    if (metric.change) tile.createSpan({ cls: "btl-sleep-summary-change " + metric.change.tone, text: metric.change.text,
      attr: { title: "较上周 " + metric.change.text, "aria-label": "较上周 " + metric.change.text } });
  }
}

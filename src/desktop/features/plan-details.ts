import { Menu } from "obsidian";
import { shortDurationLabel } from "../../timeline/duration-format";
import { formatTime, itemStart } from "../../timeline/model";
import type { PlanProgress } from "../../timeline/branch-plan-progress";
import type { TimelineItem } from "../../types";

export function showPlanRecords(
  anchor: HTMLElement, date: string, plan: TimelineItem, wake: number, progress: PlanProgress, openRecord: (id: string, event: MouseEvent) => void
): void {
  const menu = new Menu();
  const start = itemStart(plan, wake);
  const planned = formatTime(start) + (plan.plannedEndMin == null ? "" : `–${formatTime(plan.plannedEndMin)}`);
  const summary = progress.minutes > 0 ? `实做 ${shortDurationLabel(progress.minutes)}` : "已完成";
  menu.addItem(row => row.setTitle(`计划 ${planned} · ${summary}`).setIsLabel(true));
  const rect = anchor.getBoundingClientRect();
  const position = { x: rect.left, y: rect.bottom + 4 };
  for (const record of progress.records) {
    const range = formatTime(record.start) + (record.end > record.start ? `–${formatTime(record.end)}` : "");
    const prefix = record.date === date ? "" : `${record.date.slice(5)} `;
    menu.addItem(row => {
      row.setTitle(`${prefix}${range} · ${record.item.title}`);
      if (record.date === date) row.onClick(() => openRecord(record.item.id, new MouseEvent("click", { clientX: position.x, clientY: position.y })));
      else row.setIsLabel(true);
    });
  }
  menu.showAtPosition(position);
}

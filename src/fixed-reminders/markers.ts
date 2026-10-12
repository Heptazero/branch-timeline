import { setIcon } from "obsidian";
import type { FixedReminder, FixedReminderResult, TimelineDayState } from "../types";
import { minuteToY } from "../timeline/model";
import { reminderClock, reminderOn } from "./model";

export function renderFixedReminderMarkers(
  canvas: HTMLElement,
  day: TimelineDayState,
  scale: number,
  date: string,
  reminders: readonly FixedReminder[],
  results: readonly FixedReminderResult[],
  open: (id: string, event: MouseEvent) => void
): void {
  for (const reminder of reminders) {
    const rule = reminderOn(reminder, date);
    if (!rule) continue;
    const result = results.find(entry => entry.reminderId === reminder.id && entry.date === date)?.result;
    const minute = Math.max(day.wake, Math.min(day.sleep, rule.minute));
    const marker = canvas.createEl("button", {
      cls: `btl-fixed-marker${result ? ` is-${result}` : ""}${rule.minute < day.wake || rule.minute > day.sleep ? " is-outside" : ""}`,
      attr: { type: "button", "aria-label": `${reminder.title}，${reminderClock(rule.minute)}${result === "done" ? "，做到了" : result === "missed" ? "，没做到" : "，未记录"}` }
    });
    marker.style.top = `${minuteToY(day, scale, minute)}px`;
    marker.dataset.reminderId = reminder.id;
    const icon = marker.createSpan({ cls: "btl-fixed-marker-icon" });
    setIcon(icon, result === "done" ? "check" : result === "missed" ? "x" : "bell");
    marker.createSpan({ cls: "btl-fixed-marker-title", text: reminder.title });
    marker.createSpan({ cls: "btl-fixed-marker-time", text: reminderClock(rule.minute) });
    marker.onpointerdown = event => event.stopPropagation();
    marker.ondblclick = event => event.stopPropagation();
    marker.onclick = event => { event.stopPropagation(); open(reminder.id, event); };
  }
}

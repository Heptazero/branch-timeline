import { setIcon } from "obsidian";
import { itemDuration } from "./timeline/model";
import type { BranchTimelineState } from "./types";
import { dateKey, logicalToday } from "./vault/format";

export function openDateHeatmapPopover(
  anchor: HTMLElement,
  selectedDate: Date,
  state: BranchTimelineState,
  onSelect: (date: Date) => void
): void {
  document.querySelectorAll(".btl-date-popover").forEach(element => element.remove());
  let month = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const popover = document.body.createDiv({ cls: "btl-date-popover" });
  const render = () => {
    popover.empty();
    const head = popover.createDiv({ cls: "btl-date-popover-head" });
    iconButton(head, "chevron-left", "上个月", () => {
      month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      render();
    });
    head.createEl("strong", { text: `${month.getFullYear()}年${month.getMonth() + 1}月` });
    iconButton(head, "chevron-right", "下个月", () => {
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      render();
    });

    const grid = popover.createDiv({ cls: "btl-date-grid" });
    for (const weekday of ["一", "二", "三", "四", "五", "六", "日"]) grid.createSpan({ cls: "btl-date-weekday", text: weekday });
    const firstOffset = (month.getDay() + 6) % 7;
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const totals = Array.from({ length: dayCount }, (_, index) => minutesOn(state, new Date(month.getFullYear(), month.getMonth(), index + 1)));
    const max = Math.max(1, ...totals);
    for (let index = 0; index < firstOffset; index++) grid.createSpan({ cls: "btl-date-empty" });
    const today = dateKey(logicalToday());
    const selected = dateKey(selectedDate);
    for (let day = 1; day <= dayCount; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const key = dateKey(date);
      const minutes = totals[day - 1];
      const button = grid.createEl("button", {
        cls: `${key === today ? " is-today" : ""}${key === selected ? " is-selected" : ""}`,
        text: String(day),
        attr: { "aria-label": `${month.getMonth() + 1}月${day}日 · ${durationLabel(minutes)}` }
      });
      button.style.setProperty("--btl-date-heat", String(minutes ? 0.12 + 0.68 * Math.sqrt(minutes / max) : 0));
      button.onclick = () => {
        cleanup();
        onSelect(date);
      };
    }
  };

  const cleanup = () => {
    popover.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape, true);
  };
  const outside = (event: Event) => {
    const target = event.target as Node;
    if (!popover.contains(target) && !anchor.contains(target)) cleanup();
  };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cleanup(); };
  render();
  placePopover(popover, anchor);
  window.setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
  }, 0);
}

function minutesOn(state: BranchTimelineState, date: Date): number {
  const day = state.days[dateKey(date)];
  if (!day) return 0;
  return day.items.reduce((total, item) => total + (item.kind === "fact" ? itemDuration(item, day.wake) : 0), 0);
}

function durationLabel(minutes: number): string {
  if (!minutes) return "无记录";
  return minutes < 60 ? `${minutes} 分钟` : `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} 小时`;
}

function iconButton(container: HTMLElement, icon: string, label: string, onClick: () => void): void {
  const button = container.createEl("button", { attr: { "aria-label": label } });
  setIcon(button, icon);
  button.onclick = onClick;
}

function placePopover(popover: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(286, window.innerWidth - 16);
  popover.style.width = `${width}px`;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
  popover.style.left = `${left}px`;
  const height = popover.getBoundingClientRect().height;
  const below = rect.bottom + 6;
  popover.style.top = `${below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 6)}px`;
}

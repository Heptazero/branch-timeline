import { setIcon } from "obsidian";
import {
  RHYTHM_KEYS,
  rhythmBounds,
  rhythmLabel,
  updateRhythmSchedule
} from "./rhythm";
import type { RhythmKey, RhythmSchedule } from "./types";

let closeCurrent: (() => void) | null = null;

export function openRhythmSchedulePopover(
  anchor: HTMLElement,
  initial: RhythmSchedule,
  onChange: (schedule: RhythmSchedule) => void | Promise<void>,
  initialKey?: RhythmKey
): void {
  closeCurrent?.();
  let schedule = { ...initial };
  const panel = document.body.createDiv({ cls: "btl-rhythm-popover" });

  const close = (): void => {
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", close);
    panel.remove();
    if (closeCurrent === close) closeCurrent = null;
  };
  const outside = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!panel.contains(target) && !anchor.contains(target)) close();
  };
  closeCurrent = close;
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", close);

  const position = (): void => {
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - panelRect.width - 8, anchorRect.right - panelRect.width));
    const below = anchorRect.bottom + 7;
    const top = below + panelRect.height <= window.innerHeight - 8
      ? below
      : Math.max(8, anchorRect.top - panelRect.height - 7);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const renderList = (): void => {
    panel.empty();
    const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
    head.createEl("strong", { text: "节律" });
    const closeButton = head.createEl("button", { attr: { "aria-label": "关闭" } });
    setIcon(closeButton, "x");
    closeButton.onclick = close;
    for (const key of RHYTHM_KEYS) {
      const row = panel.createEl("button", { cls: "btl-rhythm-row", attr: { type: "button" } });
      row.createSpan({ text: rhythmLabel(key) });
      row.createEl("strong", { text: timeLabel(schedule[key]) });
      row.onclick = () => renderWheel(key);
    }
    window.requestAnimationFrame(position);
  };

  const renderWheel = (key: RhythmKey): void => {
    panel.empty();
    const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
    const back = head.createEl("button", { attr: { "aria-label": "返回" } });
    setIcon(back, "chevron-left");
    back.onclick = initialKey ? close : renderList;
    head.createEl("strong", { text: rhythmLabel(key) });
    const current = head.createEl("span", { text: timeLabel(schedule[key]) });

    const [lower, upper] = rhythmBounds(schedule, key);
    let selected = snap(schedule[key]);
    const wheel = panel.createDiv({ cls: "btl-time-wheel" });
    const select = (minute: number, button?: HTMLButtonElement): void => {
      selected = minute;
      current.setText(timeLabel(minute));
      wheel.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === button || Number((item as HTMLElement).dataset.minute) === minute));
    };
    for (let minute = Math.ceil(lower / 5) * 5; minute <= upper; minute += 5) {
      const button = wheel.createEl("button", { text: timeLabel(minute), attr: { type: "button" } });
      button.dataset.minute = String(minute);
      button.toggleClass("is-selected", minute === selected);
      button.onclick = () => {
        select(minute, button);
        button.scrollIntoView({ block: "center", behavior: "smooth" });
      };
    }
    wheel.addEventListener("scroll", () => {
      window.clearTimeout(Number(wheel.dataset.timer || 0));
      wheel.dataset.timer = String(window.setTimeout(() => {
        const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
        const closest = [...wheel.querySelectorAll<HTMLButtonElement>("button")].sort((a, b) =>
          Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) -
          Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center)
        )[0];
        if (closest) select(Number(closest.dataset.minute), closest);
      }, 80));
    }, { passive: true });

    const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
    actions.createEl("button", { text: "取消" }).onclick = initialKey ? close : renderList;
    actions.createEl("button", { text: "完成", cls: "mod-cta" }).onclick = async () => {
      schedule = updateRhythmSchedule(schedule, key, selected);
      await onChange({ ...schedule });
      if (initialKey) close();
      else renderList();
    };
    window.requestAnimationFrame(() => {
      const selectedButton = wheel.querySelector<HTMLElement>(`[data-minute="${selected}"]`);
      selectedButton?.scrollIntoView({ block: "center" });
      position();
    });
  };

  if (initialKey) renderWheel(initialKey);
  else renderList();
}

function timeLabel(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const time = `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  return minute >= 1440 ? `${time} · 次日` : time;
}

function snap(minute: number): number {
  return Math.round(minute / 5) * 5;
}

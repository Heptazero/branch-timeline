import { setIcon } from "obsidian";
import {
  RHYTHM_BOUNDARIES,
  rhythmBoundaryBounds,
  rhythmLabel,
  updateRhythmMarker,
  updateRhythmSchedule
} from "./rhythm";
import type { RhythmBoundaryKey, RhythmKey, RhythmMarkerDefinition, RhythmSchedule } from "./types";

export type RhythmPopoverTarget =
  | { kind: "boundary"; key: RhythmBoundaryKey }
  | { kind: "marker"; id: string };

let closeCurrent: (() => void) | null = null;

export function openRhythmSchedulePopover(
  anchor: HTMLElement,
  initial: RhythmSchedule,
  initialMarkers: readonly RhythmMarkerDefinition[],
  onChange: (schedule: RhythmSchedule, markers: RhythmMarkerDefinition[]) => void | Promise<void>,
  initialTarget?: RhythmPopoverTarget,
  labels?: Partial<Record<RhythmKey, string>>
): void {
  closeCurrent?.();
  let schedule = { ...initial };
  let markers = initialMarkers.map(marker => ({ ...marker }));
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
    panel.style.left = `${left}px`;
    panel.style.top = `${below + panelRect.height <= window.innerHeight - 8 ? below : Math.max(8, anchorRect.top - panelRect.height - 7)}px`;
  };

  const titleOf = (target: RhythmPopoverTarget): string => target.kind === "boundary"
    ? rhythmLabel(target.key, labels)
    : markers.find(marker => marker.id === target.id)?.name || "节律";
  const minuteOf = (target: RhythmPopoverTarget): number => target.kind === "boundary"
    ? schedule[target.key]
    : markers.find(marker => marker.id === target.id)?.minute ?? schedule.wake;
  const boundsOf = (target: RhythmPopoverTarget): [number, number] => {
    if (target.kind === "boundary") return rhythmBoundaryBounds(schedule, target.key, markers);
    const ordered = [...markers].sort((left, right) => left.minute - right.minute);
    const index = ordered.findIndex(marker => marker.id === target.id);
    return [index > 0 ? ordered[index - 1].minute + 5 : schedule.wake + 5,
      index >= 0 && index < ordered.length - 1 ? ordered[index + 1].minute - 5 : schedule.sleep - 5];
  };

  const renderList = (): void => {
    panel.empty();
    const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
    head.createEl("strong", { text: "节律" });
    const closeButton = head.createEl("button", { attr: { "aria-label": "关闭" } });
    setIcon(closeButton, "x");
    closeButton.onclick = close;
    const rows: Array<{ target: RhythmPopoverTarget; name: string; minute: number }> = [];
    rows.push({ target: { kind: "boundary", key: "wake" }, name: rhythmLabel("wake", labels), minute: schedule.wake });
    for (const marker of markers) rows.push({
      target: { kind: "marker", id: marker.id }, name: marker.name, minute: marker.minute
    });
    rows.push({ target: { kind: "boundary", key: "sleep" }, name: rhythmLabel("sleep", labels), minute: schedule.sleep });
    rows.sort((left, right) => left.minute - right.minute);
    for (const entry of rows) {
      const row = panel.createEl("button", { cls: "btl-rhythm-row", attr: { type: "button" } });
      row.createSpan({ text: entry.name });
      row.createEl("strong", { text: timeLabel(entry.minute) });
      row.onclick = () => renderWheel(entry.target);
    }
    window.requestAnimationFrame(position);
  };

  const renderWheel = (target: RhythmPopoverTarget): void => {
    panel.empty();
    const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
    const back = head.createEl("button", { attr: { "aria-label": "返回" } });
    setIcon(back, "chevron-left");
    back.onclick = initialTarget ? close : renderList;
    head.createEl("strong", { text: titleOf(target) });
    let selected = snap(minuteOf(target));
    const current = head.createEl("span", { text: timeLabel(selected) });
    const [lower, upper] = boundsOf(target);
    const wheel = panel.createDiv({ cls: "btl-time-wheel" });
    const select = (minute: number, button?: HTMLButtonElement): void => {
      selected = minute;
      current.setText(timeLabel(minute));
      wheel.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === button));
    };
    for (let minute = Math.ceil(lower / 5) * 5; minute <= upper; minute += 5) {
      const button = wheel.createEl("button", { text: timeLabel(minute), attr: { type: "button" } });
      button.dataset.minute = String(minute);
      button.toggleClass("is-selected", minute === selected);
      button.onclick = () => { select(minute, button); button.scrollIntoView({ block: "center", behavior: "smooth" }); };
    }
    wheel.addEventListener("scroll", () => {
      window.clearTimeout(Number(wheel.dataset.timer || 0));
      wheel.dataset.timer = String(window.setTimeout(() => {
        const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
        const closest = [...wheel.querySelectorAll<HTMLButtonElement>("button")].sort((left, right) =>
          Math.abs(left.getBoundingClientRect().top + left.clientHeight / 2 - center) -
          Math.abs(right.getBoundingClientRect().top + right.clientHeight / 2 - center))[0];
        if (closest) select(Number(closest.dataset.minute), closest);
      }, 80));
    }, { passive: true });
    const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
    actions.createEl("button", { text: "取消" }).onclick = initialTarget ? close : renderList;
    actions.createEl("button", { text: "完成", cls: "mod-cta" }).onclick = async () => {
      if (target.kind === "boundary") schedule = updateRhythmSchedule(schedule, target.key, selected, markers);
      else markers = updateRhythmMarker(markers, target.id, selected, schedule);
      await onChange({ ...schedule }, markers.map(marker => ({ ...marker })));
      if (initialTarget) close();
      else renderList();
    };
    window.requestAnimationFrame(() => {
      wheel.querySelector<HTMLElement>(`[data-minute="${selected}"]`)?.scrollIntoView({ block: "center" });
      position();
    });
  };

  if (initialTarget) renderWheel(initialTarget);
  else renderList();
}

function timeLabel(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const time = `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  return minute >= 1440 ? `${time} · 次日` : time;
}

function snap(minute: number): number { return Math.round(minute / 5) * 5; }

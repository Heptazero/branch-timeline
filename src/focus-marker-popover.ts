import { DISTRACTION_LEVELS } from "./focus-events";
import { applyFocusColors, focusRhythmColor } from "./focus-rhythm-color";
import { renderTimeWheel, timeLabel } from "./time-wheel";
import type { DistractionLevel, FocusColors, MentalStateLabel } from "./types";

export interface FocusMarkerActions {
  record: (level: DistractionLevel) => void | Promise<void>;
  continue?: () => void;
  stop?: () => void | Promise<void>;
  break?: () => void | Promise<void>;
}

export interface FocusStatusActions {
  labels: readonly MentalStateLabel[];
  colors: FocusColors;
  minute: number;
  lower: number;
  upper: number;
  record: (score: number, minute: number, label?: string) => void | Promise<void>;
}

let closeCurrent: (() => void) | null = null;

export function openFocusMarkerPopover(anchor: HTMLElement, actions: FocusMarkerActions): void {
  closeCurrent?.();
  const panel = document.body.createDiv({ cls: "btl-focus-popover" });
  const cleanup = (): void => {
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", cleanup);
    panel.remove();
    if (closeCurrent === cleanup) closeCurrent = null;
  };
  const outside = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!panel.contains(target) && !anchor.contains(target)) cleanup();
  };
  closeCurrent = cleanup;
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", cleanup);

  const standalone = !actions.stop && !actions.break;
  panel.createEl("strong", { text: standalone ? "发散程度" : "刚才走神到什么程度？" });
  const levels = panel.createDiv({ cls: "btl-focus-levels" });
  for (const level of DISTRACTION_LEVELS) {
    const detail = standalone ? { light: "短暂飘走", medium: "持续发散", heavy: "长时间发散" }[level.id] : level.detail;
    const button = levels.createEl("button", { attr: { type: "button", title: detail } });
    button.createEl("strong", { text: level.label });
    button.createEl("small", { text: detail });
    button.onclick = async () => {
      await actions.record(level.id);
      if (level.id !== "heavy" || !actions.stop || !actions.break) { cleanup(); return; }
      renderRecovery(panel, actions, cleanup);
    };
  }
  place(panel, anchor);
}

export function openFocusStatusPopover(anchor: HTMLElement, actions: FocusStatusActions): void {
  closeCurrent?.();
  const panel = document.body.createDiv({ cls: "btl-focus-popover btl-status-popover" });
  applyFocusColors(panel, actions.colors);
  const cleanup = (): void => {
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", cleanup);
    panel.remove();
    if (closeCurrent === cleanup) closeCurrent = null;
  };
  const outside = (event: PointerEvent): void => {
    if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) cleanup();
  };
  closeCurrent = cleanup;
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", cleanup);
  let selectedMinute = actions.minute;
  const head = panel.createDiv({ cls: "btl-status-head" });
  head.createEl("strong", { text: "可用脑力" });
  const timeButton = head.createEl("button", { cls: "btl-status-time", attr: { type: "button", "aria-label": "选择记录时间" } });
  const content = panel.createDiv({ cls: "btl-status-content" });
  timeButton.setText(timeLabel(selectedMinute));
  timeButton.onclick = () => {
    timeButton.disabled = true;
    content.addClass("is-hidden");
    const picker = panel.createDiv({ cls: "btl-status-time-picker" });
    panel.addClass("is-time-selecting");
    const wheel = renderTimeWheel(picker, selectedMinute, actions.lower, actions.upper, minute => {
      selectedMinute = minute;
      timeButton.setText(timeLabel(minute));
    });
    const controls = picker.createDiv({ cls: "btl-rhythm-popover-actions" });
    controls.createEl("button", { text: "完成", cls: "mod-cta" }).onclick = () => {
      picker.remove();
      content.removeClass("is-hidden");
      panel.removeClass("is-time-selecting");
      timeButton.disabled = false;
      place(panel, anchor);
    };
    window.requestAnimationFrame(() => { wheel.focus(); place(panel, anchor); });
  };
  const slider = content.createEl("input", { cls: "btl-status-slider", type: "range",
    attr: { min: "0", max: "100", step: "5", value: "50", "aria-label": "当下可用脑力：红色难以投入，蓝色高度专注" } });
  const scale = content.createDiv({ cls: "btl-status-scale" });
  scale.createSpan({ text: "难以投入" });
  const current = scale.createSpan({ text: "中性" });
  scale.createSpan({ text: "高度专注" });
  const presets = content.createDiv({ cls: "btl-status-presets" });
  let selected: MentalStateLabel | undefined;
  const paint = () => {
    const score = Number(slider.value);
    slider.style.setProperty("--btl-status-color", focusRhythmColor(score / 100));
    current.setText(selected?.name || `${score}/100`);
    for (const button of Array.from(presets.children)) button.toggleClass("is-active", button.getAttribute("data-label-id") === selected?.id);
  };
  slider.oninput = () => { selected = undefined; paint(); };
  for (const label of actions.labels) {
    const button = presets.createEl("button", { text: label.name, attr: { type: "button", "data-label-id": label.id } });
    button.onclick = () => { selected = label; slider.value = String(label.score); paint(); };
  }
  paint();
  const footer = content.createDiv({ cls: "btl-status-footer" });
  footer.createEl("button", { text: "记录", cls: "mod-cta", attr: { type: "button" } }).onclick = () => {
    cleanup();
    void actions.record(Number(slider.value), selectedMinute, selected?.name);
  };
  place(panel, anchor);
}

function renderRecovery(panel: HTMLElement, actions: FocusMarkerActions, close: () => void): void {
  panel.empty();
  panel.createEl("strong", { text: "先决定下一步" });
  const row = panel.createDiv({ cls: "btl-focus-recovery" });
  action(row, "继续", () => { actions.continue?.(); close(); });
  action(row, "结束计时", async () => { close(); await actions.stop?.(); });
  action(row, "休息 5 分钟", async () => { close(); await actions.break?.(); });
}

function action(parent: HTMLElement, label: string, run: () => void | Promise<void>): void {
  const button = parent.createEl("button", { text: label, attr: { type: "button" } });
  button.onclick = () => void run();
}

function place(panel: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - panelRect.width - 8, anchorRect.right - panelRect.width));
  const below = anchorRect.bottom + 6;
  const top = below + panelRect.height <= window.innerHeight - 8
    ? below : Math.max(8, anchorRect.top - panelRect.height - 6);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

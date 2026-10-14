import { setIcon } from "obsidian";
import { renderTimeWheel, timeLabel } from "./time-wheel";

let closeCurrent: (() => void) | null = null;

/** Edit one point on the logical-day axis without changing its score or label. */
export function openMentalStateTimePopover(
  anchor: HTMLElement,
  initial: number,
  lower: number,
  upper: number,
  save: (minute: number) => void | Promise<void>
): void {
  closeCurrent?.();
  let selected = initial;
  const panel = document.body.createDiv({ cls: "btl-rhythm-popover btl-mental-time-popover" });
  const position = (): void => {
    const anchorRect = anchor.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, anchorRect.right - rect.width))}px`;
    const below = anchorRect.bottom + 7;
    panel.style.top = `${below + rect.height <= window.innerHeight - 8 ? below : Math.max(8, anchorRect.top - rect.height - 7)}px`;
  };
  const close = (): void => {
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", position);
    panel.remove();
    if (closeCurrent === close) closeCurrent = null;
  };
  const outside = (event: PointerEvent): void => {
    if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  };
  closeCurrent = close;
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", position);

  const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
  head.createEl("strong", { text: "修改状态时间" });
  const current = head.createSpan();
  const dismiss = head.createEl("button", { attr: { type: "button", "aria-label": "关闭" } });
  setIcon(dismiss, "x");
  dismiss.onclick = close;
  const wheel = renderTimeWheel(panel, initial, lower, upper, minute => { selected = minute; current.setText(timeLabel(minute)); });
  const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
  actions.createEl("button", { text: "取消" }).onclick = close;
  actions.createEl("button", { text: "保存", cls: "mod-cta" }).onclick = () => { close(); void save(selected); };
  window.requestAnimationFrame(() => {
    wheel.focus();
    position();
  });
}

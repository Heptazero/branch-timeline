import { setIcon } from "obsidian";

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
  const wheel = panel.createDiv({ cls: "btl-time-wheel" });
  const select = (minute: number): void => {
    selected = Math.max(lower, Math.min(upper, minute));
    current.setText(timeLabel(selected));
    wheel.querySelectorAll<HTMLButtonElement>("button").forEach(button =>
      button.toggleClass("is-selected", Number(button.dataset.minute) === selected));
  };
  const choices = new Set<number>([initial]);
  for (let minute = Math.ceil(lower / 5) * 5; minute <= upper; minute += 5) choices.add(minute);
  for (const minute of [...choices].sort((a, b) => a - b)) {
    const button = wheel.createEl("button", { text: timeLabel(minute), attr: { type: "button" } });
    button.dataset.minute = String(minute);
    button.onclick = () => { select(minute); button.scrollIntoView({ block: "center", behavior: "smooth" }); };
  }
  wheel.addEventListener("scroll", () => {
    window.clearTimeout(Number(wheel.dataset.timer || 0));
    wheel.dataset.timer = String(window.setTimeout(() => {
      const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
      const nearest = [...wheel.querySelectorAll<HTMLButtonElement>("button")].sort((a, b) =>
        Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) -
        Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center))[0];
      if (nearest) select(Number(nearest.dataset.minute));
    }, 80));
  }, { passive: true });
  const fine = panel.createDiv({ cls: "btl-mental-time-fine" });
  const earlier = fine.createEl("button", { text: "−1 分钟", attr: { type: "button" } });
  const later = fine.createEl("button", { text: "+1 分钟", attr: { type: "button" } });
  earlier.onclick = () => select(selected - 1);
  later.onclick = () => select(selected + 1);
  const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
  actions.createEl("button", { text: "取消" }).onclick = close;
  actions.createEl("button", { text: "保存", cls: "mod-cta" }).onclick = () => { close(); void save(selected); };
  select(initial);
  window.requestAnimationFrame(() => {
    wheel.querySelector<HTMLElement>(`[data-minute="${initial}"]`)?.scrollIntoView({ block: "center" });
    position();
  });
}

function timeLabel(minute: number): string {
  const clock = ((minute % 1440) + 1440) % 1440;
  const value = `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
  return minute >= 1440 ? `${value} · 次日` : value;
}

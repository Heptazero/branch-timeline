let closeCurrent: (() => void) | null = null;

export function openProjectPlanPopover(
  anchor: HTMLElement,
  initial: number,
  onSelect: (minutes: number) => void | Promise<void>
): void {
  closeCurrent?.();
  const panel = document.body.createDiv({ cls: "btl-rhythm-popover btl-project-plan-popover" });
  const selectedInitial = initial > 0 ? initial : 60;
  let selected = selectedInitial;
  const values = [...new Set([selectedInitial, ...Array.from({ length: 16 }, (_, index) => (index + 1) * 15)])].sort((a, b) => a - b);

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
  const position = (): void => {
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - panelRect.width - 8, anchorRect.right - panelRect.width));
    const below = anchorRect.bottom + 7;
    panel.style.left = `${left}px`;
    panel.style.top = `${below + panelRect.height <= window.innerHeight - 8 ? below : Math.max(8, anchorRect.top - panelRect.height - 7)}px`;
  };
  closeCurrent = close;
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", close);

  const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
  head.createEl("strong", { text: "今日计划" });
  const current = head.createEl("span", { text: durationLabel(selected) });
  const wheel = panel.createDiv({ cls: "btl-duration-wheel" });
  const select = (minutes: number, button?: HTMLButtonElement): void => {
    selected = minutes;
    current.setText(durationLabel(minutes));
    wheel.querySelectorAll("button").forEach(item => item.toggleClass("is-selected", item === button));
  };
  for (const minutes of values) {
    const button = wheel.createEl("button", { text: durationLabel(minutes), attr: { type: "button" } });
    button.dataset.minutes = String(minutes);
    button.toggleClass("is-selected", minutes === selected);
    button.onclick = () => {
      select(minutes, button);
      button.scrollIntoView({ block: "center", behavior: "smooth" });
    };
  }
  wheel.addEventListener("scroll", () => {
    window.clearTimeout(Number(wheel.dataset.timer || 0));
    wheel.dataset.timer = String(window.setTimeout(() => {
      const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
      const closest = [...wheel.querySelectorAll<HTMLButtonElement>("button")].sort((a, b) =>
        Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) -
        Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center))[0];
      if (closest) select(Number(closest.dataset.minutes), closest);
    }, 80));
  }, { passive: true });
  const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
  actions.createEl("button", { text: "清除" }).onclick = async () => { await onSelect(0); close(); };
  actions.createEl("button", { text: "完成", cls: "mod-cta" }).onclick = async () => { await onSelect(selected); close(); };
  window.requestAnimationFrame(() => {
    wheel.querySelector<HTMLElement>(`[data-minutes="${selected}"]`)?.scrollIntoView({ block: "center" });
    position();
  });
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return `${hours.toFixed(minutes % 60 ? 1 : 0)} 小时`;
}

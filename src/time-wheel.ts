/** Shared logical-day time wheel for status creation and point editing. */
export function renderTimeWheel(
  parent: HTMLElement,
  initial: number,
  lower: number,
  upper: number,
  onChange: (minute: number) => void,
  fineAdjust = true
): { focus: () => void; selected: () => number } {
  let selected = initial;
  const wheel = parent.createDiv({ cls: "btl-time-wheel" });
  const select = (minute: number): void => {
    window.clearTimeout(Number(wheel.dataset.timer || 0));
    selected = Math.max(lower, Math.min(upper, minute));
    wheel.querySelectorAll<HTMLButtonElement>("button").forEach(button =>
      button.toggleClass("is-selected", Number(button.dataset.minute) === selected));
    onChange(selected);
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
  if (fineAdjust) {
    const fine = parent.createDiv({ cls: "btl-mental-time-fine" });
    fine.createEl("button", { text: "−1 分钟", attr: { type: "button" } }).onclick = () => select(selected - 1);
    fine.createEl("button", { text: "+1 分钟", attr: { type: "button" } }).onclick = () => select(selected + 1);
  }
  select(initial);
  return {
    focus: () => wheel.querySelector<HTMLElement>(`[data-minute="${initial}"]`)?.scrollIntoView({ block: "center" }),
    selected: () => selected
  };
}

export function timeLabel(minute: number): string {
  const clock = ((minute % 1440) + 1440) % 1440;
  const value = `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
  return minute >= 1440 ? `${value} · 次日` : value;
}

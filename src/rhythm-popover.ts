import { setIcon } from "obsidian";
import { rhythmBoundaryBounds, rhythmLabel, updateRhythmMarker, updateRhythmSchedule } from "./rhythm";
import type { RhythmBoundaryKey, RhythmKey, RhythmMarkerDefinition, RhythmSchedule } from "./types";

type Target = { kind: "boundary"; key: RhythmBoundaryKey } | { kind: "marker"; id: string };
let closeCurrent: (() => void) | null = null;
const WIDTH_KEY = "btl-rhythm-panel-width";

export function openRhythmSchedulePopover(
  anchor: HTMLElement,
  initial: RhythmSchedule,
  initialMarkers: readonly RhythmMarkerDefinition[],
  onChange: (schedule: RhythmSchedule, markers: RhythmMarkerDefinition[], labels: Record<RhythmKey, string>) => void | Promise<void>,
  initialLabels: Record<RhythmKey, string>,
  onClose?: () => void | Promise<void>
): void {
  closeCurrent?.();
  let schedule = { ...initial };
  let markers = initialMarkers.map(marker => ({ ...marker }));
  let labels = { ...initialLabels };
  const panel = document.body.createDiv({ cls: "btl-rhythm-popover" });
  const savedWidth = Number(localStorage.getItem(WIDTH_KEY));
  panel.style.width = `${Number.isFinite(savedWidth) && savedWidth >= 210 && savedWidth <= 440 ? savedWidth : 236}px`;
  const position = (): void => {
    const anchorRect = anchor.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, anchorRect.right - rect.width))}px`;
    const below = anchorRect.bottom + 7;
    panel.style.top = `${below + rect.height <= window.innerHeight - 8 ? below : Math.max(8, anchorRect.top - rect.height - 7)}px`;
  };
  const refreshPosition = (): void => { window.requestAnimationFrame(position); };
  const close = (): void => {
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", position);
    panel.remove();
    if (closeCurrent === close) closeCurrent = null;
    void onClose?.();
  };
  const outside = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!panel.contains(target) && !anchor.contains(target)) close();
  };
  closeCurrent = close;
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", position);

  const save = async (): Promise<void> => onChange({ ...schedule }, markers.map(marker => ({ ...marker })), { ...labels });
  const titleOf = (target: Target): string => target.kind === "boundary"
    ? rhythmLabel(target.key, labels) : markers.find(marker => marker.id === target.id)?.name || "节律";
  const minuteOf = (target: Target): number => target.kind === "boundary"
    ? schedule[target.key] : markers.find(marker => marker.id === target.id)?.minute ?? schedule.wake;
  const boundsOf = (target: Target): [number, number] => {
    if (target.kind === "boundary") return rhythmBoundaryBounds(schedule, target.key, markers);
    const ordered = [...markers].sort((a, b) => a.minute - b.minute);
    const index = ordered.findIndex(marker => marker.id === target.id);
    return [index > 0 ? ordered[index - 1].minute + 5 : schedule.wake + 5,
      index >= 0 && index < ordered.length - 1 ? ordered[index + 1].minute - 5 : schedule.sleep - 5];
  };
  const header = (title: string, back?: () => void): HTMLElement => {
    const head = panel.createDiv({ cls: "btl-rhythm-popover-head" });
    if (back) {
      const button = head.createEl("button", { attr: { type: "button", "aria-label": "返回" } });
      setIcon(button, "chevron-left");
      button.onclick = back;
    }
    head.createEl("strong", { text: title });
    return head;
  };
  const resize = (): void => {
    const grip = panel.createEl("button", { cls: "btl-rhythm-resize", attr: { type: "button", "aria-label": "拖动调整节律宽度", title: "拖动调整宽度" } });
    setIcon(grip, "grip");
    grip.onpointerdown = event => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      const startLeft = panel.getBoundingClientRect().left;
      grip.onpointermove = move => {
        panel.style.width = `${Math.max(210, Math.min(440, startWidth + move.clientX - startX, window.innerWidth - startLeft - 8))}px`;
      };
      grip.onpointerup = () => {
        grip.onpointermove = null;
        grip.onpointerup = null;
        localStorage.setItem(WIDTH_KEY, String(Math.round(panel.getBoundingClientRect().width)));
      };
    };
  };
  const renderName = (target: Target | null, minute?: number): void => {
    panel.empty();
    header(target ? "重命名" : "添加节律", renderList);
    const input = panel.createEl("input", { cls: "btl-text-input btl-rhythm-name", attr: { placeholder: "名称", "aria-label": "节律名称" } });
    input.value = target ? titleOf(target) : "";
    const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
    actions.createEl("button", { text: "取消" }).onclick = renderList;
    const submit = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    const commit = async (): Promise<void> => {
      const value = input.value.trim();
      if (!value) { input.focus(); return; }
      if (!target) markers.push({ id: `rhythm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: value, minute: minute! });
      else if (target.kind === "boundary") labels[target.key] = value;
      else markers = markers.map(marker => marker.id === target.id ? { ...marker, name: value } : marker);
      await save(); renderList();
    };
    submit.onclick = () => void commit();
    input.onkeydown = event => { if (event.key === "Enter") void commit(); };
    resize(); refreshPosition(); window.setTimeout(() => input.focus(), 0);
  };
  const renderDelete = (target: Extract<Target, { kind: "marker" }>): void => {
    panel.empty();
    header("删除节律", renderList);
    panel.createDiv({ cls: "btl-rhythm-confirm", text: `删除“${titleOf(target)}”？时间记录不会删除。` });
    const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
    actions.createEl("button", { text: "取消" }).onclick = renderList;
    actions.createEl("button", { text: "删除", cls: "mod-warning" }).onclick = async () => {
      markers = markers.filter(marker => marker.id !== target.id);
      await save(); renderList();
    };
    resize(); refreshPosition();
  };
  const renderList = (): void => {
    panel.empty();
    const head = header("节律");
    const add = head.createEl("button", { attr: { type: "button", "aria-label": "添加节律", title: "添加节律" } });
    setIcon(add, "plus");
    add.onclick = () => {
      const points = [schedule.wake, ...markers.map(marker => marker.minute), schedule.sleep].sort((a, b) => a - b);
      let gap = { lower: points[0], upper: points[1] };
      for (let i = 1; i < points.length - 1; i += 1) if (points[i + 1] - points[i] > gap.upper - gap.lower) gap = { lower: points[i], upper: points[i + 1] };
      if (gap.upper - gap.lower < 10) return;
      renderName(null, Math.round((gap.lower + gap.upper) / 10) * 5);
    };
    const closeButton = head.createEl("button", { attr: { type: "button", "aria-label": "关闭" } });
    setIcon(closeButton, "x"); closeButton.onclick = close;
    const rows: Array<{ target: Target; name: string; minute: number }> = ([
      { target: { kind: "boundary", key: "wake" }, name: rhythmLabel("wake", labels), minute: schedule.wake },
      ...markers.map(marker => ({ target: { kind: "marker", id: marker.id } as Target, name: marker.name, minute: marker.minute })),
      { target: { kind: "boundary", key: "sleep" }, name: rhythmLabel("sleep", labels), minute: schedule.sleep }
    ] as Array<{ target: Target; name: string; minute: number }>).sort((a, b) => a.minute - b.minute);
    for (const entry of rows) {
      const row = panel.createDiv({ cls: "btl-rhythm-row" });
      const time = row.createEl("button", { cls: "btl-rhythm-row-time", attr: { type: "button", "aria-label": `修改${entry.name}时间` } });
      time.createSpan({ text: entry.name });
      time.createEl("strong", { text: timeLabel(entry.minute) });
      time.onclick = () => renderWheel(entry.target);
      const more = row.createEl("button", { cls: "btl-rhythm-more", attr: { type: "button", "aria-label": `${entry.name}菜单`, title: "更多" } });
      setIcon(more, "more-vertical");
      more.onclick = () => {
        panel.querySelector(".btl-rhythm-inline-menu")?.remove();
        const menu = row.createDiv({ cls: "btl-rhythm-inline-menu" });
        menu.createEl("button", { text: "重命名" }).onclick = () => renderName(entry.target);
        if (entry.target.kind === "marker") menu.createEl("button", { text: "删除" }).onclick = () => renderDelete(entry.target as Extract<Target, { kind: "marker" }>);
        refreshPosition();
      };
    }
    resize(); refreshPosition();
  };
  const renderWheel = (target: Target): void => {
    panel.empty();
    const head = header(titleOf(target), renderList);
    let selected = Math.round(minuteOf(target) / 5) * 5;
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
        const nearest = [...wheel.querySelectorAll<HTMLButtonElement>("button")].sort((a, b) =>
          Math.abs(a.getBoundingClientRect().top + a.clientHeight / 2 - center) -
          Math.abs(b.getBoundingClientRect().top + b.clientHeight / 2 - center))[0];
        if (nearest) select(Number(nearest.dataset.minute), nearest);
      }, 80));
    }, { passive: true });
    const actions = panel.createDiv({ cls: "btl-rhythm-popover-actions" });
    actions.createEl("button", { text: "取消" }).onclick = renderList;
    actions.createEl("button", { text: "完成", cls: "mod-cta" }).onclick = async () => {
      if (target.kind === "boundary") schedule = updateRhythmSchedule(schedule, target.key, selected, markers);
      else markers = updateRhythmMarker(markers, target.id, selected, schedule);
      await save(); renderList();
    };
    resize();
    window.requestAnimationFrame(() => { wheel.querySelector<HTMLElement>(`[data-minute="${selected}"]`)?.scrollIntoView({ block: "center" }); position(); });
  };
  renderList();
}

function timeLabel(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const value = `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  return minute >= 1440 ? `${value} · 次日` : value;
}

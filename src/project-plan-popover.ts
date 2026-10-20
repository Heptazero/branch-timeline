import { Notice } from "obsidian";
import type { ProjectGoalScope } from "./pages/project-goals";

let closeCurrent: (() => void) | null = null;

export function openProjectPlanPopover(
  anchor: HTMLElement,
  initial: number,
  onSelect: (minutes: number) => void | Promise<void>,
  options: { scope?: ProjectGoalScope } = {}
): void {
  closeCurrent?.();
  const doc = anchor.ownerDocument;
  const win = doc.defaultView || window;
  const label = options.scope === "week" ? "本周计划" : "今日计划";
  const panel = doc.body.createDiv({ cls: "btl-project-goal-popover", attr: { role: "dialog", "aria-label": label } });
  let closed = false;
  let saving = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    doc.removeEventListener("pointerdown", outside, true);
    doc.removeEventListener("keydown", keydown, true);
    doc.removeEventListener("scroll", position, true);
    win.removeEventListener("resize", position);
    win.visualViewport?.removeEventListener("resize", position);
    win.visualViewport?.removeEventListener("scroll", position);
    if (panel.contains(doc.activeElement) && anchor.isConnected) anchor.focus();
    panel.remove();
    if (closeCurrent === close) closeCurrent = null;
  };
  const outside = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!panel.contains(target) && !anchor.contains(target)) close();
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  };
  const position = (): void => {
    if (closed) return;
    if (!anchor.isConnected) { close(); return; }
    const rect = anchor.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    const viewport = win.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + 8;
    const topEdge = (viewport?.offsetTop || 0) + 8;
    const rightEdge = leftEdge + (viewport?.width || win.innerWidth) - 16;
    const bottomEdge = topEdge + (viewport?.height || win.innerHeight) - 16;
    const left = Math.max(leftEdge, Math.min(rightEdge - size.width, rect.right - size.width));
    const below = rect.bottom + 7;
    panel.style.left = `${left}px`;
    const top = below + size.height <= bottomEdge ? below : rect.top - size.height - 7;
    panel.style.top = `${Math.max(topEdge, Math.min(bottomEdge - size.height, top))}px`;
  };
  panel.createDiv({ cls: "btl-project-goal-label", text: label });
  const editor = panel.createDiv({ cls: "btl-project-goal-editor" });
  const minus = editor.createEl("button", { text: "−", attr: { type: "button", "aria-label": "减少半小时" } });
  const amount = editor.createDiv({ cls: "btl-project-goal-amount" });
  const input = amount.createEl("input", {
    attr: { type: "text", inputmode: "decimal", "aria-label": `${label}，小时`, autocomplete: "off" }
  });
  amount.createSpan({ text: "h" });
  const plus = editor.createEl("button", { text: "+", attr: { type: "button", "aria-label": "增加半小时" } });
  const actions = panel.createDiv({ cls: "btl-project-goal-actions" });
  actions.createEl("button", { text: "取消", attr: { type: "button" } }).onclick = close;
  const save = actions.createEl("button", { text: "保存", cls: "mod-cta", attr: { type: "button" } });
  const value = (): number | null => {
    if (!input.value.trim()) return null;
    const hours = Number(input.value.trim().replace(",", "."));
    const minutes = Math.round(hours * 60);
    return Number.isFinite(minutes) && hours >= 0 ? minutes : null;
  };
  const update = (): void => {
    const minutes = value();
    input.setAttribute("aria-invalid", String(minutes === null));
    minus.disabled = saving || minutes === null || minutes <= 0;
    plus.disabled = saving || minutes === null;
    save.disabled = saving || minutes === null;
  };
  const set = (minutes: number): void => {
    input.value = String(Number((Math.max(0, minutes) / 60).toFixed(2)));
    update();
  };
  set(Number.isFinite(initial) ? initial : 0);
  minus.onclick = () => set((value() || 0) - 30);
  plus.onclick = () => set((value() || 0) + 30);
  input.oninput = update;
  const submit = async (): Promise<void> => {
    const minutes = value();
    if (saving || minutes === null) return;
    saving = true;
    input.disabled = true;
    update();
    try { await onSelect(minutes); close(); }
    catch (error) {
      saving = false;
      input.disabled = false;
      update();
      new Notice(error instanceof Error ? error.message : "保存失败");
    }
  };
  save.onclick = () => { void submit(); };
  input.onkeydown = event => {
    if (event.key === "Enter") { event.preventDefault(); void submit(); }
  };
  closeCurrent = close;
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("keydown", keydown, true);
  doc.addEventListener("scroll", position, true);
  win.addEventListener("resize", position);
  win.visualViewport?.addEventListener("resize", position);
  win.visualViewport?.addEventListener("scroll", position);
  position();
  win.requestAnimationFrame(() => {
    if (closed) return;
    position();
    input.focus({ preventScroll: true });
    input.select();
  });
}

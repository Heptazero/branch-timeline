import { DISTRACTION_LEVELS } from "./focus-events";
import type { DistractionLevel } from "./types";

export interface FocusMarkerActions {
  record: (level: DistractionLevel) => void | Promise<void>;
  continue: () => void;
  stop: () => void | Promise<void>;
  break: () => void | Promise<void>;
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

  panel.createEl("strong", { text: "刚才走神到什么程度？" });
  const levels = panel.createDiv({ cls: "btl-focus-levels" });
  for (const level of DISTRACTION_LEVELS) {
    const button = levels.createEl("button", { attr: { type: "button", title: level.detail } });
    button.createEl("strong", { text: level.label });
    button.createEl("small", { text: level.detail });
    button.onclick = async () => {
      await actions.record(level.id);
      if (level.id !== "heavy") { cleanup(); return; }
      renderRecovery(panel, actions, cleanup);
    };
  }
  place(panel, anchor);
}

function renderRecovery(panel: HTMLElement, actions: FocusMarkerActions, close: () => void): void {
  panel.empty();
  panel.createEl("strong", { text: "先决定下一步" });
  const row = panel.createDiv({ cls: "btl-focus-recovery" });
  action(row, "继续", () => { actions.continue(); close(); });
  action(row, "结束计时", async () => { close(); await actions.stop(); });
  action(row, "休息 5 分钟", async () => { close(); await actions.break(); });
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

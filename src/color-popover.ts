export interface ColorPopoverChoice {
  id: string;
  label: string;
  color: string;
}

let closeCurrent: (() => void) | null = null;

export function openColorPopover(
  anchor: HTMLElement,
  choices: readonly ColorPopoverChoice[],
  selected: string,
  onSelect: (id: string) => void | Promise<void>
): void {
  closeCurrent?.();
  const panel = document.body.createDiv({ cls: "btl-color-popover" });
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

  for (const choice of choices) {
    const button = panel.createEl("button", {
      cls: choice.id === selected ? "is-selected" : "",
      attr: { type: "button", "aria-label": choice.label, title: choice.label }
    });
    button.style.setProperty("--btl-color-choice", choice.color);
    button.onclick = async () => {
      await onSelect(choice.id);
      close();
    };
  }

  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - panelRect.width - 8, anchorRect.left));
  const below = anchorRect.bottom + 6;
  const top = below + panelRect.height <= window.innerHeight - 8
    ? below
    : Math.max(8, anchorRect.top - panelRect.height - 6);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

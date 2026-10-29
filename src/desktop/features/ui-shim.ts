import { fuzzyMatchProjectTask } from "../../vault/project-tasks";
import { report } from "./rpc";
export class App { [key: string]: any }
export class TFile { [key: string]: any; constructor(value: Record<string, unknown> = {}) { Object.assign(this, value); this.extension = "md"; } }
export class MarkdownView { editor: any; constructor(editor: any) { this.editor = editor; } }
export class WorkspaceLeaf { [key: string]: any }
export class ItemView {
  app: App; contentEl: HTMLElement; containerEl: HTMLElement;
  constructor(leaf: WorkspaceLeaf) { this.app = leaf.app; this.containerEl = this.contentEl = leaf.contentEl; }
}
export class Notice { constructor(message: string) { const host = document.createElement("div"); host.className = "notice"; host.textContent = message; document.body.append(host); setTimeout(() => host.remove(), 4500); } }
export function normalizePath(path: string): string { return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/$/, ""); }
const symbols: Record<string, string> = { plus: "+", x: "×", check: "✓", "chevron-left": "‹", "chevron-right": "›", "chevron-down": "⌄", "more-vertical": "⋮", settings: "⚙", "undo-2": "↶", cloud: "☁", "trash-2": "×", "grip-vertical": "⠿", "minus": "−", "chevrons-left-right": "↔", flag: "⚑", search: "⌕", "move-horizontal": "↔", "arrow-left-right": "↔", "git-branch": "⑂", "git-merge": "↙", "git-branch-plus": "⑂+", "circle-plus": "⊕", "more-horizontal": "⋯", "arrow-up": "↑", "arrow-down": "↓", "pencil": "✎", "pencil-line": "✎", "activity": "∿", timer: "◷", square: "□", bell: "♧" };
export function setIcon(element: HTMLElement, icon: string): void { element.textContent = symbols[icon] || "•"; element.setAttribute("data-icon", icon); }
export class Modal {
  modalEl = document.createElement("div"); contentEl = document.createElement("div"); containerEl = document.createElement("div");
  private previousFocus: Element | null = null;
  private keyListener = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); this.close(); } };
  constructor(public app: App) { this.containerEl.className = "modal-container"; this.modalEl.className = "modal"; this.contentEl.className = "modal-content"; this.modalEl.append(this.contentEl); this.containerEl.append(this.modalEl); }
  open(): void { this.previousFocus = document.activeElement; document.addEventListener("keydown", this.keyListener); document.body.append(this.containerEl); this.containerEl.addEventListener("pointerdown", event => { if (event.target === this.containerEl) this.close(); }); this.onOpen(); }
  close(): void { document.removeEventListener("keydown", this.keyListener); this.onClose(); this.containerEl.remove(); (this.previousFocus as HTMLElement | null)?.focus(); }
  onOpen(): void {}
  onClose(): void {}
}
export class FuzzySuggestModal<T> extends Modal {
  inputEl = document.createElement("input"); private placeholder = "";
  setPlaceholder(value: string): this { this.placeholder = value; return this; }
  getItems(): T[] { return []; } getItemText(item: T): string { return String(item); } onChooseItem(_item: T): void {}
  onOpen(): void {
    this.inputEl.placeholder = this.placeholder; this.contentEl.append(this.inputEl); const list = this.contentEl.createDiv({ cls: "suggestion-list" });
    let visible: T[] = [], selected = 0;
    const paint = () => list.querySelectorAll("button").forEach((button, index) => button.classList.toggle("is-selected", index === selected));
    const choose = (item: T) => { this.onChooseItem(item); this.close(); };
    const render = () => { list.empty(); selected = 0; visible = this.getItems().filter(item => fuzzyMatchProjectTask(this.getItemText(item), this.inputEl.value));
      for (const item of visible) list.createEl("button", { text: this.getItemText(item) }).onclick = () => choose(item);
      paint();
    };
    this.inputEl.onkeydown = event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); selected = Math.max(0, Math.min(visible.length - 1, selected + (event.key === "ArrowDown" ? 1 : -1))); paint(); list.querySelectorAll("button")[selected]?.scrollIntoView({ block: "nearest" }); }
      if (event.key === "Enter" && visible[selected]) { event.preventDefault(); choose(visible[selected]); }
    };
    this.inputEl.oninput = render; render(); this.inputEl.focus();
  }
}
export class MenuItem {
  element = document.createElement("button"); private action: (() => unknown) | null = null;
  constructor() { this.element.type = "button"; this.element.onpointerdown = event => event.stopPropagation(); this.element.onclick = () => { this.element.closest(".menu")?.remove(); Promise.resolve().then(() => this.action?.()).catch(report); }; }
  setTitle(text: string): this { this.element.textContent = text; return this; }
  setIcon(_name: string): this { return this; } setChecked(value: boolean): this { this.element.classList.toggle("is-checked", value); return this; }
  setWarning(value: boolean): this { this.element.classList.toggle("is-warning", value); return this; }
  setDisabled(value: boolean): this { this.element.disabled = value; return this; } setIsLabel(value: boolean): this { return this.setDisabled(value); }
  onClick(action: () => unknown): this { this.action = action; return this; }
}
export class Menu {
  element = document.createElement("div");
  constructor() { this.element.className = "menu"; }
  addItem(callback: (item: MenuItem) => unknown): this { const item = new MenuItem(); callback(item); this.element.append(item.element); return this; }
  addSeparator(): this { this.element.append(document.createElement("hr")); return this; }
  showAtMouseEvent(event: MouseEvent): void { this.showAtPosition({ x: event.clientX, y: event.clientY }); }
  showAtPosition(position: { x: number; y: number }): void {
    document.querySelectorAll(".menu").forEach(menu => menu.remove()); document.body.append(this.element);
    this.element.style.left = Math.max(6, Math.min(position.x, innerWidth - this.element.offsetWidth - 6)) + "px";
    this.element.style.top = Math.max(6, Math.min(position.y, innerHeight - this.element.offsetHeight - 6)) + "px";
    setTimeout(() => { const dismiss = (event: PointerEvent) => { if (!this.element.contains(event.target as Node)) { this.element.remove(); document.removeEventListener("pointerdown", dismiss, true); } }; document.addEventListener("pointerdown", dismiss, true); }, 0);
  }
}
export { Setting, AbstractInputSuggest, PluginSettingTab } from "./settings-shim";

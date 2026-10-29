import { App, setIcon } from "./ui-shim";
import { report } from "./rpc";
class InputControl {
  inputEl: HTMLInputElement; extraSettingsEl: HTMLElement;
  constructor(host: HTMLElement, type = "text") { this.inputEl = host.createEl("input", { type }); this.extraSettingsEl = this.inputEl; }
  setValue(value: string | boolean): this { if (typeof value === "boolean") this.inputEl.checked = value; else this.inputEl.value = value; return this; }
  setPlaceholder(value: string): this { this.inputEl.placeholder = value; return this; }
  onChange(callback: (value: any) => unknown): this { this.inputEl.addEventListener(this.inputEl.type === "checkbox" ? "change" : "input", () => Promise.resolve(callback(this.inputEl.type === "checkbox" ? this.inputEl.checked : this.inputEl.value)).catch(report)); return this; }
}
class ButtonControl {
  extraSettingsEl: HTMLButtonElement;
  constructor(host: HTMLElement) { this.extraSettingsEl = host.createEl("button"); }
  setIcon(icon: string): this { setIcon(this.extraSettingsEl, icon); return this; }
  setTooltip(label: string): this { this.extraSettingsEl.title = label; this.extraSettingsEl.setAttribute("aria-label", label); return this; }
  setButtonText(value: string): this { this.extraSettingsEl.textContent = value; return this; }
  setCta(): this { this.extraSettingsEl.classList.add("mod-cta"); return this; }
  onClick(callback: () => unknown): this { this.extraSettingsEl.onclick = () => { Promise.resolve(callback()).catch(report); }; return this; }
}
export class Setting {
  settingEl: HTMLDivElement; controlEl: HTMLDivElement; private nameEl: HTMLDivElement; private descEl: HTMLDivElement;
  constructor(host: HTMLElement) { this.settingEl = host.createDiv({ cls: "setting-item" }); const info = this.settingEl.createDiv({ cls: "setting-item-info" }); this.nameEl = info.createDiv({ cls: "setting-item-name" }); this.descEl = info.createDiv({ cls: "setting-item-description" }); this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" }); }
  setName(name: string): this { this.nameEl.textContent = name; return this; } setDesc(text: string): this { this.descEl.textContent = text; return this; }
  setClass(cls: string): this { this.settingEl.classList.add(cls); return this; } setHeading(): this { this.settingEl.classList.add("setting-item-heading"); return this; }
  addText(callback: (control: InputControl) => unknown): this { callback(new InputControl(this.controlEl)); return this; }
  addToggle(callback: (control: InputControl) => unknown): this { callback(new InputControl(this.controlEl, "checkbox")); return this; }
  addColorPicker(callback: (control: InputControl) => unknown): this { callback(new InputControl(this.controlEl, "color")); return this; }
  addExtraButton(callback: (control: ButtonControl) => unknown): this { callback(new ButtonControl(this.controlEl)); return this; }
  addButton(callback: (control: ButtonControl) => unknown): this { return this.addExtraButton(callback); }
  addTextArea(callback: (control: any) => unknown): this {
    const inputEl = this.controlEl.createEl("textarea");
    const control = { inputEl, setValue(value: string) { inputEl.value = value; return this; }, setPlaceholder(value: string) { inputEl.placeholder = value; return this; }, onChange(fn: (value: string) => unknown) { inputEl.oninput = () => { Promise.resolve(fn(inputEl.value)).catch(report); }; return this; } };
    callback(control); return this;
  }
}
export class PluginSettingTab { containerEl: HTMLElement; constructor(public app: App, _plugin: unknown) { this.containerEl = document.createElement("div"); } }
export class AbstractInputSuggest<T> {
  limit = 30; private list?: HTMLElement;
  constructor(_app: App, protected inputEl: HTMLInputElement) { inputEl.addEventListener("input", () => void this.open()); inputEl.addEventListener("blur", () => setTimeout(() => this.close(), 180)); }
  protected getSuggestions(_query: string): T[] | Promise<T[]> { return []; }
  renderSuggestion(item: T, el: HTMLElement): void { el.textContent = String(item); }
  selectSuggestion(_item: T): void {}
  setValue(value: string): void { this.inputEl.value = value; }
  async open(): Promise<void> { this.close(); this.list = document.body.createDiv({ cls: "suggestion-container" }); const rect = this.inputEl.getBoundingClientRect(); Object.assign(this.list.style, { left: rect.left + "px", top: rect.bottom + "px", width: Math.max(160, rect.width) + "px" }); for (const item of (await this.getSuggestions(this.inputEl.value)).slice(0, this.limit)) { const row = this.list.createEl("button"); this.renderSuggestion(item, row); row.onmousedown = event => { event.preventDefault(); this.selectSuggestion(item); this.close(); }; } }
  close(): void { this.list?.remove(); this.list = undefined; }
}

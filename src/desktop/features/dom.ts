/** Obsidian's small DOM helper surface, scoped to the bundled feature page. */
export function installDOM(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.createEl = function(this: HTMLElement, tag: string, options: Record<string, unknown> = {}) {
    const element = document.createElement(tag);
    const cls = options.cls; if (cls) element.className = Array.isArray(cls) ? cls.join(" ") : String(cls);
    if (options.text != null) element.textContent = String(options.text);
    for (const [key, value] of Object.entries((options.attr || {}) as Record<string, unknown>)) if (value != null) element.setAttribute(key, String(value));
    for (const key of ["type", "value", "placeholder", "title", "href"]) if (options[key] != null) element.setAttribute(key, String(options[key]));
    this.append(element); return element;
  };
  for (const [name, tag] of [["createDiv", "div"], ["createSpan", "span"]]) {
    proto[name] = function(this: HTMLElement, options: string | Record<string, unknown> = {}) { return this.createEl(tag as "div", typeof options === "string" ? { cls: options } : options); };
  }
  proto.empty = function(this: HTMLElement) { this.replaceChildren(); };
  proto.setText = function(this: HTMLElement, text: unknown) { this.textContent = String(text ?? ""); return this; };
  proto.addClass = function(this: HTMLElement, ...classes: string[]) { this.classList.add(...classes.flatMap(value => value.split(" ").filter(Boolean))); return this; };
  proto.removeClass = function(this: HTMLElement, ...classes: string[]) { this.classList.remove(...classes); return this; };
  proto.toggleClass = function(this: HTMLElement, cls: string, active: boolean) { this.classList.toggle(cls, active); return this; };
  proto.hasClass = function(this: HTMLElement, cls: string) { return this.classList.contains(cls); };
  proto.setAttr = function(this: HTMLElement, key: string, value: unknown) { if (value == null) this.removeAttribute(key); else this.setAttribute(key, String(value)); return this; };
  proto.setAttrs = function(this: HTMLElement, attrs: Record<string, unknown>) { Object.entries(attrs).forEach(([key, value]) => this.setAttr(key, value as string)); return this; };
  proto.find = function(this: HTMLElement, selector: string) { return this.querySelector(selector); };
}

export class TFile {
  constructor(public path = "") {}
  get basename(): string { return this.path.split("/").at(-1)?.replace(/\.md$/, "") || ""; }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function setIcon(_element: HTMLElement, _icon: string): void {
  throw new Error("DOM icon rendering is outside this test adapter");
}

export class TFile {
  constructor(public path = "") {}
  get basename(): string { return this.path.split("/").at(-1)?.replace(/\.md$/, "") || ""; }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

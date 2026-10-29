import { TFile } from "obsidian";
import { MarkdownView, Modal } from "./ui-shim";
import type { App } from "obsidian";
import { rpc } from "./rpc";
export interface FeatureCatalog { settings: Record<string, unknown>; statePath: string; files: Array<{ path: string; name: string; basename: string; stat: { mtime: number; size: number }; frontmatter: Record<string, string> }> }
export const CONFIG = ".obsidian/plugins/branch-timeline-hz/data.json";
export function makeApp(catalog: FeatureCatalog, onSettings: () => void): App {
  const files = new Map<string, TFile>(), metadata = new Map<string, Record<string, unknown>>(), reads = new Map<string, string>();
  const refreshCatalog = (next: FeatureCatalog) => { files.clear(); metadata.clear(); for (const value of next.files) { files.set(value.path, Object.assign(new TFile(), value)); metadata.set(value.path, value.frontmatter); } };
  refreshCatalog(catalog);
  const index = (path: string, text: string) => {
    const name = path.split("/").at(-1)!; const file = files.get(path) || Object.assign(new TFile(), { path, name, basename: name.replace(/\.md$/, ""), extension: "md", stat: { mtime: Date.now(), size: text.length } });
    files.set(path, file); const frontmatter: Record<string, string> = {};
    if (text.startsWith("---")) for (const line of text.split(/\r?\n/).slice(1)) { if (line === "---") break; const match = /^(type|status|color):\s*(.*?)\s*$/.exec(line); if (match) frontmatter[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); }
    metadata.set(path, frontmatter); return file;
  };
  const read = async (path: string) => { const text = await rpc<string>("read", { path }); if (path === CONFIG || path === catalog.statePath) reads.set(path, text); return text; };
  const write = async (path: string, text: string, expected: string | null) => {
    await rpc("write", { path, text, expected });
    if (path.endsWith(".md")) index(path, text);
    if (path === CONFIG || path === catalog.statePath) reads.set(path, text);
  };
  const vault = {
    getMarkdownFiles: () => [...files.values()], getAbstractFileByPath: (path: string) => files.get(path) || null,
    read: (file: TFile) => read(file.path), cachedRead: (file: TFile) => read(file.path),
    process: async (file: TFile, transform: (text: string) => string) => { const before = await read(file.path), after = transform(before); if (before !== after) await write(file.path, after, before); return after; },
    modify: async (file: TFile, text: string) => write(file.path, text, await read(file.path)),
    create: async (path: string, text: string) => { await write(path, text, null); return index(path, text); },
    createFolder: (path: string) => rpc("mkdir", { path }),
    trash: async (file: TFile) => { await rpc("trash", { path: file.path, expected: await read(file.path) }); files.delete(file.path); metadata.delete(file.path); },
    adapter: { exists: (path: string) => rpc<boolean>("exists", { path }), read,
      write: async (path: string, text: string) => { if (!reads.has(path) && await rpc("exists", { path })) await read(path); await write(path, text, reads.get(path) ?? null); },
      mkdir: (path: string) => rpc("mkdir", { path }) }
  };
  const leaf = { view: {} as unknown, openFile: async (file: TFile) => {
    const content = await read(file.path), lines = content.split("\n");
    const modal = new Modal({} as any); modal.contentEl.classList.add("markdown-preview");
    const head = modal.contentEl.createDiv({ cls: "markdown-preview-head" }); head.createEl("strong", { text: file.basename });
    head.createEl("button", { text: "在 Obsidian 编辑" }).onclick = () => { void rpc("open", { path: file.path }); };
    head.createEl("button", { text: "×", attr: { "aria-label": "关闭" } }).onclick = () => modal.close();
    const body = modal.contentEl.createDiv({ cls: "markdown-lines" });
    lines.forEach((text, index) => body.createDiv({ text: text || " ", attr: { "data-line": String(index) } }));
    const focus = (at: { line: number }) => { body.querySelectorAll(".is-line-focused").forEach(item => item.classList.remove("is-line-focused")); const row = body.querySelector<HTMLElement>(`[data-line="${at.line}"]`); row?.classList.add("is-line-focused"); row?.scrollIntoView({ block: "center" }); };
    leaf.view = new MarkdownView({ lineCount: () => lines.length, setCursor: focus, scrollIntoView: (value: { from: { line: number } }) => focus(value.from) });
    modal.open();
  }, setViewState: async () => {}, setPinned: () => {} };
  return { vault, refreshCatalog, metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: metadata.get(file.path) || {} }) },
    workspace: { getLeaf: () => leaf, setActiveLeaf: () => {}, revealLeaf: async () => {}, getLeavesOfType: () => [], openLinkText: (path: string) => rpc("open", { path }) },
    setting: { open: onSettings, openTabById: onSettings } } as unknown as App;
}

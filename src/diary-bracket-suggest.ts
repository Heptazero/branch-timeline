import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, Plugin, TFile, normalizePath } from "obsidian";
import { diaryWeek } from "./pages/life-diary";
import { diaryBracketTrigger, extractDiaryBracketTerms, rankDiaryBracketTerms, type DiaryBracketTerm } from "./diary-bracket-model";

export class DiaryBracketSuggest extends EditorSuggest<DiaryBracketTerm> {
  private readonly perFile = new Map<string, { date: string; terms: string[] }>();
  private terms: DiaryBracketTerm[] = [];
  private refreshTimer: number | null = null;
  private readonly pendingPaths = new Set<string>();
  private loadedFolder = "";

  constructor(app: App, private folder: () => string) { super(app); this.limit = 20; }

  start(plugin: Plugin): void {
    plugin.registerEditorSuggest(this);
    plugin.registerEvent(this.app.vault.on("modify", file => { if (file instanceof TFile && this.isDiary(file.path)) this.queueRefresh(file); }));
    plugin.registerEvent(this.app.vault.on("create", file => { if (file instanceof TFile && this.isDiary(file.path)) this.queueRefresh(file); }));
    plugin.registerEvent(this.app.vault.on("delete", file => { if (this.perFile.delete(file.path)) this.rebuild(); }));
    plugin.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.perFile.delete(oldPath)) this.rebuild();
      if (file instanceof TFile && this.isDiary(file.path)) this.queueRefresh(file);
    }));
    plugin.register(() => { if (this.refreshTimer != null) window.clearTimeout(this.refreshTimer); });
    void this.reload();
  }

  async reload(): Promise<void> {
    const folder = this.folder().trim();
    const files = this.app.vault.getMarkdownFiles().filter(file => this.isDiary(file.path));
    const indexed = await Promise.all(files.map(async file => {
      try { return { path: file.path, date: diaryWeek(file.path)?.date || "", terms: extractDiaryBracketTerms(await this.app.vault.read(file)) }; }
      catch { return null; }
    }));
    this.perFile.clear();
    for (const item of indexed) if (item) this.perFile.set(item.path, { date: item.date, terms: item.terms });
    this.loadedFolder = folder;
    this.rebuild();
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!file || !this.isDiary(file.path)) return null;
    if (this.loadedFolder !== this.folder().trim()) { void this.reload(); return null; }
    const trigger = diaryBracketTrigger(editor.getLine(cursor.line), cursor.ch);
    if (!trigger) return null;
    return { start: { line: cursor.line, ch: trigger.from }, end: cursor, query: trigger.query };
  }

  getSuggestions(context: EditorSuggestContext): DiaryBracketTerm[] { return rankDiaryBracketTerms(this.terms, context.query, this.limit); }

  renderSuggestion(term: DiaryBracketTerm, el: HTMLElement): void { el.setText(`[${term.value}]`); }

  selectSuggestion(term: DiaryBracketTerm, _event: MouseEvent | KeyboardEvent): void {
    const context = this.context;
    if (!context) return;
    const { editor, start } = context;
    const line = editor.getLine(start.line);
    let end = context.end.ch;
    while (end < line.length && /[\p{L}\p{N}_-]/u.test(line[end])) end++;
    if (line[end] === "]") end++;
    const insert = `[${term.value}]${end === line.length ? " " : ""}`;
    editor.replaceRange(insert, start, { line: start.line, ch: end });
    editor.setCursor({ line: start.line, ch: start.ch + insert.length });
  }

  private isDiary(path: string): boolean {
    const folder = this.folder().trim();
    return Boolean(folder) && path.startsWith(`${normalizePath(folder).replace(/\/$/, "")}/`) && path.endsWith(".md");
  }

  private queueRefresh(file: TFile): void {
    this.pendingPaths.add(file.path);
    if (this.refreshTimer != null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => { this.refreshTimer = null; void this.refreshPending(); }, 450);
  }

  private async refreshPending(): Promise<void> {
    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();
    await Promise.all(paths.map(async path => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || !this.isDiary(path)) { this.perFile.delete(path); return; }
      try { this.perFile.set(path, { date: diaryWeek(path)?.date || "", terms: extractDiaryBracketTerms(await this.app.vault.read(file)) }); }
      catch { this.perFile.delete(path); }
    }));
    this.rebuild();
  }

  private rebuild(): void {
    const terms = new Map<string, DiaryBracketTerm>();
    for (const { date, terms: values } of this.perFile.values()) for (const value of values) {
      const item = terms.get(value);
      if (item) { item.count++; if (date > item.lastDate) item.lastDate = date; }
      else terms.set(value, { value, count: 1, lastDate: date });
    }
    this.terms = [...terms.values()];
  }
}

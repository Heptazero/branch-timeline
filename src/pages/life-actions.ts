import { App, MarkdownView, Menu, Notice, TFile } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { ConfirmModal } from "../modals";
import type { LifeEvent } from "../types";
import { diaryFilePath, diaryHeading } from "../vault/format";
import { LifeEventModal, type LifeEventDraft } from "./life-event-modal";
import { parseLifeDate } from "./life-model";
import { renderLifeTimeline } from "./life-timeline";
import { loadLifeDiary } from "./life-diary-index";
import type { LifeDiaryEntry, LifeDiaryWeek } from "./life-diary";

export class LifeActions {
  constructor(private app: App, private plugin: BranchTimelinePlugin, private refresh: () => Promise<void>) {}

  async render(container: HTMLElement, events: readonly LifeEvent[], anchor: number | undefined, onAnchor: (year: number) => void): Promise<void> {
    const diary = await loadLifeDiary(this.app, this.plugin.settings.diaryFolder, this.plugin.settings.lifeDiaryFormats);
    if (!container.parentElement) return;
    renderLifeTimeline({ container, events: [...events, ...diary.entries], weeks: diary.weeks, anchor, onAnchor,
      onAdd: date => this.add(date), onEdit: event => this.edit(event), onMenu: (event, mouse) => this.menu(event, mouse),
      hasDiary: event => this.hasDiary(event), onDiary: event => void this.openDiary(event), onWeek: week => void this.openDiaryWeek(week) });
  }

  add(date?: string): void {
    new LifeEventModal(this.app, value => { if (value) void this.save(value); }, undefined, date).open();
  }

  edit(event: LifeEvent): void {
    if (this.isDiaryEntry(event)) { void this.openDiary(event); return; }
    new LifeEventModal(this.app, value => { if (value) void this.save(value, event.id); }, event).open();
  }

  menu(event: LifeEvent, mouse: MouseEvent): void {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("编辑").setIcon("pencil").onClick(() => this.edit(event)));
    if (this.hasDiary(event)) menu.addItem(item => item.setTitle("打开当周日记").setIcon("book-open").onClick(() => void this.openDiary(event)));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(() => {
      new ConfirmModal(this.app, `删除“${event.title}”？`, "仅删除此人生节点，不修改周记或其他记录。", async () => {
        await this.plugin.store.update(state => { state.lifeEvents = state.lifeEvents.filter(item => item.id !== event.id); });
        await this.refresh();
      }).open();
    }));
    menu.showAtPosition({ x: mouse.clientX, y: mouse.clientY });
  }

  hasDiary(event: LifeEvent): boolean {
    if (this.isDiaryEntry(event)) return true;
    if (event.kind === "chapter" || parseLifeDate(event.date)?.precision !== "day") return false;
    const date = this.eventDate(event);
    return Boolean(date && this.app.vault.getAbstractFileByPath(diaryFilePath(date, this.plugin.settings.diaryFolder)) instanceof TFile);
  }

  async openDiary(event: LifeEvent): Promise<void> {
    if (this.isDiaryEntry(event)) { await this.openDiaryAt(event.diaryPath, event.diaryLine); return; }
    const date = this.eventDate(event);
    if (!date) return;
    const file = this.app.vault.getAbstractFileByPath(diaryFilePath(date, this.plugin.settings.diaryFolder));
    if (!(file instanceof TFile)) { new Notice("这周没有日记"); return; }
    const heading = `## ${diaryHeading(date)}`;
    const content = await this.app.vault.read(file);
    const line = content.split("\n").findIndex(value => value.trim() === heading);
    await this.openDiaryAt(file.path, Math.max(0, line));
  }

  private async openDiaryWeek(week: LifeDiaryWeek): Promise<void> { await this.openDiaryAt(week.path, 0); }

  private isDiaryEntry(event: LifeEvent): event is LifeDiaryEntry { return "diaryPath" in event; }

  private async openDiaryAt(path: string, line: number): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { new Notice("周记文件不存在"); return; }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof MarkdownView) {
      const safeLine = Math.max(0, Math.min(line, leaf.view.editor.lineCount() - 1));
      leaf.view.editor.setCursor({ line: safeLine, ch: 0 });
      leaf.view.editor.scrollIntoView({ from: { line: safeLine, ch: 0 }, to: { line: safeLine, ch: 0 } }, true);
    }
  }

  private eventDate(event: LifeEvent): Date | null {
    const parts = parseLifeDate(event.date);
    return parts?.precision === "day" ? new Date(parts.year, parts.month - 1, parts.day) : null;
  }

  private async save(value: LifeEventDraft, id?: string): Promise<void> {
    await this.plugin.store.update(state => {
      const target = id ? state.lifeEvents.find(event => event.id === id) : undefined;
      if (target) Object.assign(target, value);
      else state.lifeEvents.push({ id: `life-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, ...value });
    });
    await this.refresh();
  }
}

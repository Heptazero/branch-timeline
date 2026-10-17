import { App, MarkdownView, Notice, TFile } from "obsidian";
import type { TimelineItem } from "../types";
import type { VaultRepository } from "../vault/repository";

export async function openItemProjectLog(app: App, repository: VaultRepository, item: TimelineItem): Promise<void> {
  const path = item.projectLogPath || item.projectPath;
  if (!path) return;
  try {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { new Notice("项目日志文件不存在"); return; }
    const line = await repository.projectLogLine(path, item.projectLogId);
    const leaf = app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof MarkdownView)) return;
    const at = Math.max(0, Math.min(line, leaf.view.editor.lineCount() - 1));
    leaf.view.editor.setCursor({ line: at, ch: 0 });
    leaf.view.editor.scrollIntoView({ from: { line: at, ch: 0 }, to: { line: at, ch: 0 } }, true);
  } catch (error) { new Notice(error instanceof Error ? error.message : "项目日志打开失败"); }
}

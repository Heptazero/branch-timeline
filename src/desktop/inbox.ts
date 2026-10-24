import { Notice, Platform } from "obsidian";
import type BranchTimelinePlugin from "../main";
import { defaultDay } from "../vault/state-store";
import { DESKTOP_ID, parseDesktopSession, type DesktopEntry } from "./session-model";
import { importDesktopSession, type DesktopReceipt } from "./import-session";

export function installDesktopInbox(plugin: BranchTimelinePlugin): void {
  if (!Platform.isDesktopApp || !Platform.isMacOS) return;
  const inbox = new DesktopInbox(plugin);
  plugin.register(() => inbox.stop());
  plugin.addCommand({ id: "import-mac-records", name: "导入 Mac App 计时记录", callback: () => void inbox.scan() });
  plugin.registerEvent(plugin.app.vault.on("create", file => inbox.enqueue(file.path)));
  plugin.registerEvent(plugin.app.vault.on("modify", file => inbox.enqueue(file.path)));
  plugin.app.workspace.onLayoutReady(() => void inbox.scan());
}

class DesktopInbox {
  private pending = new Set<string>();
  private busy = false;
  private stopped = false;
  constructor(private plugin: BranchTimelinePlugin) {}
  stop(): void { this.stopped = true; this.pending.clear(); }
  private folder(): string {
    const parent = this.plugin.settings.statePath.split("/").slice(0, -1).join("/");
    return `${parent ? parent + "/" : ""}desktop-inbox`;
  }
  private sourceID(path: string): string | null {
    if (!path.startsWith(this.folder() + "/")) return null;
    const name = path.slice(this.folder().length + 1);
    const id = name.endsWith(".json") ? name.slice(0, -5) : "";
    return DESKTOP_ID.test(id) ? id.toLowerCase() : null;
  }
  enqueue(path: string): void {
    if (this.stopped || !this.sourceID(path)) return;
    this.pending.add(path);
    if (!this.busy) void this.drain();
  }
  async scan(): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      if (!(await adapter.exists(this.folder()))) return;
      for (const path of (await adapter.list(this.folder())).files) this.enqueue(path);
    } catch (error) { new Notice(`Mac 记录读取失败：${error instanceof Error ? error.message : "请检查数据目录"}`); }
  }
  private async receipt(path: string, id: string): Promise<DesktopReceipt | null> {
    const adapter = this.plugin.app.vault.adapter;
    if (!(await adapter.exists(path))) return null;
    const value = JSON.parse(await adapter.read(path)) as DesktopReceipt;
    if (value.id !== id || !["imported", "too-short", "error"].includes(value.status)) throw new Error("Mac 导入回执损坏，未覆盖");
    return value;
  }
  private async drain(): Promise<void> {
    this.busy = true;
    try {
      while (!this.stopped && this.pending.size) {
        const path = this.pending.values().next().value as string;
        this.pending.delete(path);
        const id = this.sourceID(path); if (!id) continue;
        const receiptPath = path.replace(/\.json$/, ".receipt.json");
        const adapter = this.plugin.app.vault.adapter;
        try {
          const previous = await this.receipt(receiptPath, id);
          if (previous && previous.status !== "error") continue;
          const session = parseDesktopSession(await adapter.read(path));
          if (session.id.toLowerCase() !== id.toLowerCase()) throw new Error("Mac 记录编号与文件名不一致");
          const project = this.plugin.repository.listProjects().find(project => project.path.normalize("NFC") === session.projectPath.normalize("NFC"));
          if (!project) throw new Error("找不到关联项目，请确认项目文件和 type 配置");
          session.projectPath = project.path;
          await importDesktopSession(session, {
            receipt: () => this.receipt(receiptPath, id), state: () => this.plugin.store.load(),
            commit: entry => this.commit(entry), acknowledge: receipt => adapter.write(receiptPath, JSON.stringify(receipt))
          });
          await this.plugin.refreshViews();
        } catch (error) {
          const message = error instanceof Error ? error.message : "记录导入失败";
          try {
            const previous = await this.receipt(receiptPath, id);
            if (!previous || previous.status === "error") await adapter.write(receiptPath, JSON.stringify({ id, status: "error", message }));
          } catch { /* Keep an unreadable receipt intact for inspection. */ }
          new Notice(`Mac 记录未导入：${message}`);
        }
      }
    } finally { this.busy = false; }
  }
  private async commit(entry: DesktopEntry): Promise<void> {
    if (this.stopped) throw new Error("插件已关闭，记录保留等待下次导入");
    const item = entry.item;
    await this.plugin.repository.importDesktopWork(item.projectPath!, entry.date, item.endMin!, item.endMin! - item.startMin!,
      [item.title, item.note].filter(Boolean).join(" — "), item.id, async () => {
        await this.plugin.store.update(state => {
          if (this.stopped) throw new Error("插件已关闭，已停止导入");
          if (Object.values(state.days).some(day => day.items.some(existing => existing.id === item.id))) throw new Error("Mac 记录已被并发导入，请重试");
          const day = state.days[entry.date] ||= defaultDay(this.plugin.settings.rhythm);
          day.items.push(item);
          (day.distractions ||= []).push(...entry.distractions);
          (day.goodStates ||= []).push(...entry.goodStates);
        });
      });
  }
}

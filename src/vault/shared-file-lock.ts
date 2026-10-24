import type { App } from "obsidian";

/** Same Mac, same lock protocol as TimelineCore.SharedFileLock; no Node imports on mobile. */
export async function withSharedFileLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  const fs = require("node:fs/promises") as typeof import("node:fs/promises");
  const path = require("node:path") as typeof import("node:path");
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const canonical = (await fs.realpath(file)).normalize("NFC");
  const root = `/tmp/branch-timeline-locks-${process.getuid!()}`;
  const folder = `${root}/${crypto.createHash("sha256").update(canonical).digest("hex")}`;
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const owner = JSON.stringify({ pid: process.pid, token: crypto.randomUUID() });
  const deadline = Date.now() + 3000;
  for (;;) {
    try { await fs.mkdir(folder, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const previous = await fs.readFile(path.join(folder, "owner"), "utf8");
        const pid = JSON.parse(previous).pid;
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (status) {
            if ((status as NodeJS.ErrnoException).code === "ESRCH" && await fs.readFile(path.join(folder, "owner"), "utf8") === previous) {
              const reaper = folder + ".reap";
              const claimed = await fs.mkdir(reaper, { mode: 0o700 }).then(() => true, () => false);
              if (claimed) {
                try {
                  if (await fs.readFile(path.join(folder, "owner"), "utf8") === previous) {
                    await fs.unlink(path.join(folder, "owner")); await fs.rmdir(folder);
                  }
                } finally { await fs.rmdir(reaper); }
                continue;
              }
            }
          }
        }
      } catch { /* An initializing or unreadable owner is busy; never steal a live lock. */ }
      if (Date.now() >= deadline) throw new Error("时间线正在被另一个程序保存，请稍后重试");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try { await fs.writeFile(path.join(folder, "owner"), owner, { flag: "wx", mode: 0o600 }); return await action(); }
  finally {
    if (await fs.readFile(path.join(folder, "owner"), "utf8").catch(() => "") === owner) {
      await fs.unlink(path.join(folder, "owner")); await fs.rmdir(folder);
    }
  }
}

export async function withDesktopStateLock<T>(app: App, relative: string, action: (absolute?: string) => Promise<T>): Promise<T> {
  const adapter = app.vault.adapter as typeof app.vault.adapter & { getBasePath?: () => string };
  if (typeof adapter.getBasePath !== "function" || typeof process === "undefined" || process.platform !== "darwin") return action();
  const fs = require("node:fs/promises") as typeof import("node:fs/promises");
  const path = require("node:path") as typeof import("node:path");
  const root = await fs.realpath(adapter.getBasePath());
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw new Error("数据文件超出笔记库");
  if (!(await fs.stat(absolute).catch(() => null))) return action();
  const canonical = await fs.realpath(absolute);
  if (!canonical.startsWith(root + path.sep)) throw new Error("数据文件超出笔记库");
  return withSharedFileLock(canonical, () => action(canonical));
}

export async function atomicStateWrite(absolute: string, content: string): Promise<void> {
  const fs = require("node:fs/promises") as typeof import("node:fs/promises");
  const temporary = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  try {
    const mode = (await fs.stat(absolute)).mode & 0o777;
    await fs.writeFile(temporary, content, { flag: "wx", mode });
    await fs.rename(temporary, absolute);
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}

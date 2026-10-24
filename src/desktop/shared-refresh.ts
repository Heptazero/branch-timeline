import type BranchTimelinePlugin from "../main";

/** Ignore native checkpoints: only visible timeline changes should redraw the plugin. */
export function installSharedRefresh(plugin: BranchTimelinePlugin): void {
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false, previous = "";
  const refresh = async (initial = false) => {
    try {
      const raw = JSON.parse(await plugin.app.vault.adapter.read(plugin.settings.statePath));
      const { macTimer: _timer, desktopReceipts: _receipts, ...visible } = raw;
      const fingerprint = JSON.stringify(visible);
      if (!stopped && !initial && fingerprint !== previous) await plugin.refreshViews();
      previous = fingerprint;
    } catch { /* StateStore reports invalid data; never replace it with an empty state. */ }
  };
  plugin.register(() => { stopped = true; if (timer) clearTimeout(timer); });
  const changed = (file: { path: string }) => {
    if (file.path !== plugin.settings.statePath) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void refresh(); }, 150);
  };
  plugin.registerEvent(plugin.app.vault.on("modify", changed));
  plugin.registerEvent(plugin.app.vault.on("create", changed));
  void refresh(true);
}

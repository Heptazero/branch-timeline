import type BranchTimelinePlugin from "../main";

/** Remove a marked project log before removing its timeline fact. */
export async function removeTimelineItem(plugin: BranchTimelinePlugin, date: string, itemId: string): Promise<void> {
  const state = await plugin.store.load();
  const item = state.days[date]?.items.find(candidate => candidate.id === itemId);
  if (!item) return;
  const logPath = item.projectLogPath || item.projectPath;
  if (logPath && item.projectLogId) {
    await plugin.repository.removeProjectWorkLog(logPath, item.projectLogId);
  }
  await plugin.store.update(next => {
    const day = next.days[date];
    if (day) day.items = day.items.filter(candidate => candidate.id !== itemId);
  });
}

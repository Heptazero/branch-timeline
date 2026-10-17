import type BranchTimelinePlugin from "../main";
import { itemDuration } from "./model";

/** Reassign one item, moving its plugin-owned Markdown work log before changing state. */
export async function reassignItemProject(plugin: BranchTimelinePlugin, date: string, itemId: string, projectPath: string | null): Promise<void> {
  if (!projectPath && plugin.settings.itemMetadataRequirement === "project") throw new Error("当前设置要求事项关联项目");
  const state = await plugin.store.load();
  const day = state.days[date];
  const item = day?.items.find(candidate => candidate.id === itemId);
  if (!item || !day) throw new Error("事项已改变，请重新打开后操作");
  const fromPath = item.projectLogId ? item.projectLogPath || item.projectPath || null : null;
  const minutes = item.kind === "fact" && !item.factTiming ? itemDuration(item, day.wake) : 0;
  const workId = item.projectLogId || (projectPath && minutes > 0 ? item.id : undefined);
  if (item.projectPath === projectPath && (!fromPath || fromPath === projectPath)) return;
  const logTarget = projectPath && workId ? projectPath : null;
  const commit = async (): Promise<void> => {
    await plugin.store.update(next => {
      const target = next.days[date]?.items.find(candidate => candidate.id === itemId);
      if (!target || target.projectPath !== item.projectPath || target.projectLogPath !== item.projectLogPath
        || target.projectLogId !== item.projectLogId) throw new Error("事项已被修改，项目归属未更改");
      target.projectPath = projectPath || undefined;
      target.projectBranchId = null;
      target.projectTaskId = undefined;
      target.projectTaskTitle = undefined;
      target.projectLogId = logTarget ? workId : undefined;
      target.projectLogPath = logTarget || undefined;
      if (!projectPath) target.milestone = false;
    });
  };
  if (!fromPath && !logTarget) { await commit(); return; }
  const end = item.endMin ?? item.startMin ?? item.plannedMin ?? day.wake;
  await plugin.repository.relocateProjectWorkLog(
    fromPath, logTarget, date, end, minutes, item.note || item.title, workId!, commit
  );
}

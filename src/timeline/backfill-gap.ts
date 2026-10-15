import type BranchTimelinePlugin from "../main";
import type { TimelineItemDraftResult } from "../timeline-item-draft-modal";
import { dateKey } from "../vault/format";
import { defaultDay } from "../vault/state-store";

/** Keep the project log and its timeline fact paired during a gap backfill. */
export async function recordBackfilledGap(
  plugin: BranchTimelinePlugin,
  date: Date,
  startMinute: number,
  endMinute: number,
  draft: TimelineItemDraftResult,
  factId: string
): Promise<void> {
  const commit = async (): Promise<void> => {
    await plugin.store.update(state => {
      const day = state.days[dateKey(date)] ||= defaultDay(plugin.settings.rhythm);
      day.items.push({
        id: factId, title: draft.title, kind: "fact", startMin: startMinute, endMin: endMinute,
        projectPath: draft.projectPath || undefined,
        projectLogId: draft.projectPath ? factId : undefined,
        projectLogPath: draft.projectPath || undefined,
        note: draft.note || undefined
      });
    });
  };
  if (draft.projectPath) {
    await plugin.repository.addProjectLog(
      draft.projectPath, date, endMinute, Math.max(1, Math.round(endMinute - startMinute)),
      draft.note || draft.title, factId, commit
    );
  } else await commit();
}

import type BranchTimelinePlugin from "./main";
import type { TimelineItemDraftResult } from "./timeline-item-draft-modal";

export async function prepareTimelineTodoProject(
  plugin: BranchTimelinePlugin,
  draft: TimelineItemDraftResult,
  date: Date,
  minute: number,
  todoId: string
): Promise<string | undefined> {
  const taskId = draft.task?.kind === "existing" ? draft.task.entry.id || todoId
    : draft.task?.kind === "new" ? todoId : undefined;
  if (draft.projectPath) {
    await plugin.repository.prepareTimelineTodo(draft.projectPath, date, minute, draft.note, draft.task, taskId);
  }
  return taskId;
}

export async function rememberTimelineTodoProject(
  plugin: BranchTimelinePlugin,
  draft: TimelineItemDraftResult,
  taskId?: string
): Promise<void> {
  if (!draft.projectPath) return;
  plugin.settings.linkProjectWorkTasks = draft.linkTask;
  if (taskId) plugin.settings.lastProjectTasks[draft.projectPath] = taskId;
  if (draft.task?.kind === "new") plugin.settings.lastProjectTaskHeadings[draft.projectPath] = draft.task.headingKey;
  else if (draft.task?.kind === "existing") plugin.settings.lastProjectTaskHeadings[draft.projectPath] = draft.task.entry.headingKey;
  await plugin.saveSettings(false);
}

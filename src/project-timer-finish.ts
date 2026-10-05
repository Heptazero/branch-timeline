import { App, Notice } from "obsidian";
import type BranchTimelinePlugin from "./main";
import { ProjectWorkModal } from "./project-work-modal";
import type { TimelineItem } from "./types";

export interface ProjectTimerFinish {
  note: string;
  taskId?: string;
  taskTitle?: string;
}

/** Finish a timed timeline item without asking for an already-known duration. */
export async function finishProjectTimer(
  app: App,
  plugin: BranchTimelinePlugin,
  item: TimelineItem,
  date: Date,
  end: number,
  minutes: number,
  factId: string,
  completeTask: boolean
): Promise<ProjectTimerFinish | null> {
  if (!item.projectPath) return null;
  const project = plugin.repository.listProjects().find(candidate => candidate.path === item.projectPath);
  if (!project) { new Notice("找不到关联项目"); return null; }
  let index;
  try { index = await plugin.repository.projectTasks(project.path); }
  catch (error) { new Notice(error instanceof Error ? error.message : "项目任务读取失败"); return null; }
  const previousTaskId = item.projectTaskId || plugin.settings.lastProjectTasks[project.path];
  const result = await new Promise<import("./project-work-modal").ProjectWorkResult | null>(resolve => new ProjectWorkModal(
    app, project.name, index, !!item.projectTaskId || plugin.settings.linkProjectWorkTasks,
    previousTaskId, plugin.settings.lastProjectTaskHeadings[project.path], resolve, minutes, item.note || ""
  ).open());
  if (!result) return null;
  const freshId = () => `btl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const taskId = result.task?.kind === "existing" ? result.task.entry.id || freshId()
    : result.task?.kind === "new" ? freshId() : undefined;
  const taskTitle = result.task?.kind === "existing" ? result.task.entry.title
    : result.task?.kind === "new" ? result.task.title : undefined;
  const note = [taskTitle ? `@${taskTitle}` : "", result.note].filter(Boolean).join(" ");
  try {
    await plugin.repository.recordProjectWork(project.path, date, end, minutes, note, factId, result.task, taskId, completeTask);
  } catch (error) {
    new Notice(error instanceof Error ? error.message : "项目工时写入失败");
    return null;
  }
  plugin.settings.linkProjectWorkTasks = result.linkTask;
  if (taskId) plugin.settings.lastProjectTasks[project.path] = taskId;
  if (result.task?.kind === "new") plugin.settings.lastProjectTaskHeadings[project.path] = result.task.headingKey;
  else if (result.task?.kind === "existing") plugin.settings.lastProjectTaskHeadings[project.path] = result.task.entry.headingKey;
  await plugin.saveSettings(false);
  return { note: result.note, taskId, taskTitle };
}

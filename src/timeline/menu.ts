import { Menu } from "obsidian";
import type { ProjectRef, TimelineBranch, TimelineItem, TimelineTag } from "../types";

export interface ItemMenuActions {
  complete: () => void;
  startTiming: () => void;
  stopTiming: () => void;
  cancelTiming: () => void;
  backfill: () => void;
  toggleMilestone?: () => void;
  rename: () => void;
  setProject: (projectPath: string | null) => void;
  setTag: (tagId: string | null) => void;
  remove: () => void;
}

export function showItemMenu(
  event: MouseEvent,
  item: TimelineItem,
  tags: readonly TimelineTag[],
  projects: readonly ProjectRef[],
  actions: ItemMenuActions
): void {
  const menu = new Menu();
  const running = item.factTiming || (item.kind === "todo" && item.startedMin != null);
  if (item.kind === "todo") menu.addItem(entry => entry.setTitle(running ? "完成并停止计时" : "完成").setIcon("check").onClick(actions.complete));
  if (running) {
    menu.addItem(entry => entry.setTitle(item.kind === "fact" ? "停止计时" : "取消计时").setIcon("square").onClick(item.kind === "fact" ? actions.stopTiming : actions.cancelTiming));
  } else {
    menu.addItem(entry => entry.setTitle(item.kind === "fact" ? "继续计时" : "开始计时").setIcon("timer").onClick(actions.startTiming));
  }
  menu.addItem(entry => entry.setTitle("补记时长…").setIcon("history").onClick(actions.backfill));
  const toggleMilestone = actions.toggleMilestone;
  if (toggleMilestone) {
    menu.addItem(entry => entry.setTitle(item.milestone ? "取消里程碑" : "设为里程碑").setIcon("flag").onClick(toggleMilestone));
  }
  menu.addItem(entry => entry.setTitle("重命名").setIcon("pencil").onClick(actions.rename));
  menu.addSeparator();
  menu.addItem(entry => entry.setTitle("项目").setIsLabel(true));
  menu.addItem(entry => entry.setTitle("无项目").setChecked(!item.projectPath).onClick(() => actions.setProject(null)));
  for (const project of assignableProjects(projects, item.projectPath)) {
    menu.addItem(entry => entry
      .setTitle(project.name)
      .setChecked(item.projectPath === project.path)
      .onClick(() => actions.setProject(project.path)));
  }
  menu.addSeparator();
  menu.addItem(entry => entry.setTitle("标签").setIsLabel(true));
  menu.addItem(entry => entry.setTitle("无标签").setChecked(!item.tagId && !item.tag).onClick(() => actions.setTag(null)));
  for (const tag of tags) {
    menu.addItem(entry => entry
      .setTitle(tag.name)
      .setChecked(item.tagId === tag.id || (!item.tagId && item.tag === tag.name))
      .onClick(() => actions.setTag(tag.id)));
  }
  menu.addSeparator();
  menu.addItem(entry => entry.setTitle("删除").setIcon("trash-2").setWarning(true).onClick(actions.remove));
  menu.showAtPosition({ x: event.clientX, y: event.clientY });
}

function assignableProjects(projects: readonly ProjectRef[], currentPath?: string): ProjectRef[] {
  return projects.filter(project => project.path === currentPath || ["active", "doing", "进行中"].includes(project.status.trim().toLowerCase()));
}

export interface BranchMenuActions {
  rename: () => void;
  flip: () => void;
  remove: () => void;
}

export function showBranchMenu(event: MouseEvent, branch: TimelineBranch, actions: BranchMenuActions): void {
  const menu = new Menu();
  menu.addItem(entry => entry.setTitle("重命名").setIcon("pencil").onClick(actions.rename));
  menu.addItem(entry => entry.setTitle(branch.side > 0 ? "挪到左侧" : "挪到右侧").setIcon("arrow-left-right").onClick(actions.flip));
  menu.addSeparator();
  menu.addItem(entry => entry.setTitle("删除分支").setIcon("trash-2").setWarning(true).onClick(actions.remove));
  menu.showAtPosition({ x: event.clientX, y: event.clientY });
}

import { Menu } from "obsidian";
import type { TimelineBranch, TimelineItem, TimelineTag } from "../types";

export interface ItemMenuActions {
  complete: () => void;
  rename: () => void;
  setTag: (tagId: string | null) => void;
  remove: () => void;
}

export function showItemMenu(
  event: PointerEvent,
  item: TimelineItem,
  tags: readonly TimelineTag[],
  actions: ItemMenuActions
): void {
  const menu = new Menu();
  if (item.kind === "todo") menu.addItem(entry => entry.setTitle("完成").setIcon("check").onClick(actions.complete));
  menu.addItem(entry => entry.setTitle("重命名").setIcon("pencil").onClick(actions.rename));
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

export interface BranchMenuActions {
  rename: () => void;
  flip: () => void;
  remove: () => void;
}

export function showBranchMenu(event: PointerEvent, branch: TimelineBranch, actions: BranchMenuActions): void {
  const menu = new Menu();
  menu.addItem(entry => entry.setTitle("重命名").setIcon("pencil").onClick(actions.rename));
  menu.addItem(entry => entry.setTitle(branch.side > 0 ? "挪到左侧" : "挪到右侧").setIcon("arrow-left-right").onClick(actions.flip));
  menu.addSeparator();
  menu.addItem(entry => entry.setTitle("删除分支").setIcon("trash-2").setWarning(true).onClick(actions.remove));
  menu.showAtPosition({ x: event.clientX, y: event.clientY });
}

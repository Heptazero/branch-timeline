import { Menu } from "obsidian";
import { shortDurationLabel } from "../timeline/duration-format";
import { formatTime, itemDuration } from "../timeline/model";
import type { BranchTimelineState } from "../types";
import { projectGroupZoom, type ProjectEntryGroup } from "./project-entry-groups";
import type { ProjectDetailOptions } from "./project-detail";
import { splitAbsoluteMinute } from "./project-model";

export function renderProjectGroupMarker(
  canvas: HTMLElement, scroller: HTMLElement, options: ProjectDetailOptions, group: ProjectEntryGroup, x: number, y: number, besideMilestone: boolean
): void {
  const minutes = completedMinutes(options.state, group);
  const title = `${group.entries.length} 项${minutes > 0 ? " · " + shortDurationLabel(minutes) : ""}`;
  const zoom = projectGroupZoom(group, options.scale);
  const marker = canvas.createEl("button", {
    cls: `btl-project-group${besideMilestone ? " is-beside-milestone" : ""}${zoom ? " is-zoomable" : ""}`,
    attr: { type: "button", "data-project-branch-id": group.branchId || "", "aria-label": `${title}，${zoom ? "放大查看" : "查看记录"}`, title: `${title} · ${zoom ? "放大查看" : "查看记录"}` }
  });
  marker.style.left = `${x}px`;
  marker.style.top = `${y}px`;
  marker.createSpan({ cls: "btl-project-group-dot" });
  marker.createSpan({ cls: "btl-project-group-caption", text: title });
  marker.onclick = event => {
    event.stopPropagation();
    if (zoom) {
      options.onScale(zoom, { abs: (group.first + group.last) / 2, offset: scroller.clientHeight / 2, left: scroller.scrollLeft });
      return;
    }
    const rect = marker.getBoundingClientRect(), menu = new Menu();
    for (const entry of group.entries) {
      const { date, minute } = splitAbsoluteMinute(entry.abs);
      menu.addItem(row => row.setTitle(`${date.slice(5)} ${formatTime(minute)} · ${entry.item.title}`).onClick(() =>
        options.onItemMenu(entry, new MouseEvent("click", { clientX: rect.left, clientY: rect.bottom + 4 }))));
    }
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  };
}

function completedMinutes(state: BranchTimelineState, group: ProjectEntryGroup): number {
  return group.entries.reduce((minutes, entry) => {
    const day = state.days[entry.date];
    return minutes + (day && entry.item.kind === "fact" && !entry.item.factTiming ? itemDuration(entry.item, day.wake) : 0);
  }, 0);
}

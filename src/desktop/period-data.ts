import type { TimelineDayState, TimelineItem } from "../types";
import { itemDuration, itemEnd, itemStart } from "../timeline/model";
export interface NativeProject { path: string; name: string; color: string; status: string }

export function nativeItems(day: TimelineDayState | undefined, activeId: string | undefined, nowMinute?: number) {
  return (day?.items || []).map(item => {
    const plan = item.kind === "todo" && item.startedMin == null;
    const start = itemStart(item, day!.wake);
    return { id: item.id, title: item.title, kind: item.kind, note: item.note || "", plan,
      editable: !item.factTiming && (item.kind === "fact" || plan) && !item.id.startsWith(`desktop-${activeId}-`),
      revision: JSON.stringify(item), projectPath: item.projectPath || "", branchId: item.branchId || "", start,
      end: plan ? item.plannedEndMin ?? start + 30 : itemEnd(item, day!.wake, nowMinute) };
  });
}

/** Same additive project duration semantics as project progress; plans are always excluded. */
export function nativeDayProjects(day: TimelineDayState | undefined, catalog: NativeProject[], nowMinute?: number) {
  const sums = new Map<string, number>();
  for (const item of day?.items || []) {
    if (!recorded(item)) continue;
    const minutes = itemDuration(item, day!.wake, nowMinute), path = item.projectPath || "";
    if (minutes > 0) sums.set(path, (sums.get(path) || 0) + minutes);
  }
  return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([path, minutes]) => {
    const project = catalog.find(value => value.path === path);
    return { path, name: project?.name || path.split("/").at(-1)?.replace(/\.md$/, "") || "未关联项目", color: project?.color || "#a4aab5", minutes };
  });
}
function recorded(item: TimelineItem): boolean { return item.kind === "fact" || item.startedMin != null; }

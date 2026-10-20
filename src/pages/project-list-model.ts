import type { ProjectRef, ProjectTypeConfig } from "../types";
import type { ProjectTimeSummary } from "./project-time";
import { hoursValue } from "../time-label";

export type ProjectFilter = "active" | "planned" | "paused" | "archived" | "other" | "all";
export type ProjectSort = "duration" | "progress" | "name" | "manual";
export type SortDirection = "asc" | "desc";
export interface ProjectListEntry { project: ProjectRef; summary: ProjectTimeSummary }

export const PROJECT_FILTERS: Array<{ id: ProjectFilter; label: string }> = [
  { id: "active", label: "进行中" }, { id: "planned", label: "计划" },
  { id: "paused", label: "搁置" }, { id: "archived", label: "归档" },
  { id: "other", label: "其他" }, { id: "all", label: "全部" }
];
export const PROJECT_SORTS: Array<{ id: ProjectSort; label: string }> = [
  { id: "duration", label: "时长" }, { id: "progress", label: "完成比例" },
  { id: "name", label: "名称" }, { id: "manual", label: "手动排序" }
];

export function projectStatusGroup(status: string): ProjectFilter {
  if (["active", "doing", "进行中"].includes(status)) return "active";
  if (["todo", "plan", "planned", "计划", ""].includes(status)) return "planned";
  if (["hold", "paused", "搁置"].includes(status)) return "paused";
  if (["done", "archived", "archive", "归档"].includes(status)) return "archived";
  return "other";
}

export function sortProjectEntries(entries: ProjectListEntry[], sort: ProjectSort, direction: SortDirection,
  pinnedPaths: readonly string[], manualPaths: readonly string[], types: readonly ProjectTypeConfig[]): ProjectListEntry[] {
  const pinned = new Set(pinnedPaths);
  const manual = new Map(manualPaths.map((path, index) => [path, index]));
  const typeRank = new Map(types.map((type, index) => [type.type.toLowerCase(), index]));
  const sign = direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const pin = Number(pinned.has(b.project.path)) - Number(pinned.has(a.project.path));
    if (pin) return pin;
    let result = 0;
    if (sort === "manual") {
      result = (manual.get(a.project.path) ?? Infinity) - (manual.get(b.project.path) ?? Infinity);
      if (!result) result = (typeRank.get(a.project.type.toLowerCase()) ?? Infinity) - (typeRank.get(b.project.type.toLowerCase()) ?? Infinity);
    } else if (sort === "duration") result = (a.summary.actual - b.summary.actual) * sign;
    else if (sort === "name") result = a.project.name.localeCompare(b.project.name, "zh-CN") * sign;
    else {
      const missing = Number(!a.summary.planned) - Number(!b.summary.planned);
      if (missing) return missing;
      result = a.summary.planned && b.summary.planned
        ? (a.summary.actual / a.summary.planned - b.summary.actual / b.summary.planned) * sign : 0;
    }
    return result || a.project.name.localeCompare(b.project.name, "zh-CN");
  });
}

export function projectHours(minutes: number): string {
  return `${hoursValue(minutes)} h`;
}

import { dateKey } from "../vault/format";
import type { TimelineItem } from "../types";
export interface PlanSource { date: string; id: string; revision: string }
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
export function planSource(value: unknown, project: string): { source: PlanSource; item: TimelineItem } | null {
  if (value == null) return null;
  const source = value as PlanSource;
  if (typeof source.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.date) || dateKey(new Date(source.date + "T12:00:00")) !== source.date || typeof source.id !== "string" || !source.id || source.id.length > 400 || typeof source.revision !== "string" || source.revision.length > 200_000) throw new Error("计划关联格式无效");
  const item = JSON.parse(source.revision) as TimelineItem;
  if (!item || item.id !== source.id || item.kind !== "todo" || item.startedMin != null || item.factTiming || item.projectPath !== project) throw new Error("原计划关联无效");
  return { source, item };
}
export function unchangedPlan(item: TimelineItem, revision: string): boolean { return canonical(item) === canonical(JSON.parse(revision)); }

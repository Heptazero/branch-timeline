import type { ProjectTimelineBranch } from "../types";
import { PROJECT_SCALE_MAX } from "./project-detail-layout";
import type { ProjectTimelineEntry } from "./project-model";

export interface ProjectEntryGroup {
  branchId: string | null;
  entries: ProjectTimelineEntry[];
  first: number;
  last: number;
}

function markerSpacing(scale: number): number {
  return Math.max(18, Math.min(44, scale / 6));
}

/** Limit each group to one marker's screen footprint, including when records form a dense chain. */
export function groupProjectEntries(entries: readonly ProjectTimelineEntry[], branches: readonly ProjectTimelineBranch[], scale: number): ProjectEntryGroup[] {
  const known = new Set(branches.map(branch => branch.id));
  const lanes = new Map<string | null, ProjectEntryGroup>();
  const groups: ProjectEntryGroup[] = [];
  for (const entry of entries) {
    const id = entry.item.projectBranchId;
    const branchId = id && known.has(id) ? id : null;
    const previous = lanes.get(branchId);
    if (!entry.item.milestone && previous && (entry.abs - previous.first) * scale / 1440 < markerSpacing(scale)) {
      previous.entries.push(entry);
      previous.last = entry.abs;
      continue;
    }
    const group = { branchId, entries: [entry], first: entry.abs, last: entry.abs };
    groups.push(group);
    if (!entry.item.milestone) lanes.set(branchId, group);
  }
  return groups;
}

/** Go straight to a scale that separates the nearest distinct marks if the axis permits. */
export function projectGroupZoom(group: ProjectEntryGroup, scale: number): number | null {
  let separation = Infinity;
  for (let i = 1; i < group.entries.length; i++) {
    const distance = group.entries[i].abs - group.entries[i - 1].abs;
    if (distance > 0) separation = Math.min(separation, distance);
  }
  if (!Number.isFinite(separation) || scale >= PROJECT_SCALE_MAX) return null;
  const next = Math.min(PROJECT_SCALE_MAX, Math.max(scale * 1.6, 45 * 1440 / separation));
  const visibleSpread = (group.last - group.first) * next / 1440;
  return visibleSpread >= markerSpacing(next) ? next : null;
}

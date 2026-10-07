import { PROJECT_SCALE_MAX, PROJECT_SCALE_MIN } from "./pages/project-detail";
import type { ProjectTimeScope } from "./pages/project-time";
import { MAX_SCALE, MIN_SCALE } from "./timeline/model";

export function clampScale(value: number): number { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value)); }
export function clampProjectScale(value: number): number { return Math.max(PROJECT_SCALE_MIN, Math.min(PROJECT_SCALE_MAX, value)); }
export function readProjectTimeScope(): ProjectTimeScope {
  const value = localStorage.getItem("branch-timeline-hz-project-time-scope");
  return value === "week" || value === "total" ? value : "day";
}

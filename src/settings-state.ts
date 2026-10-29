import type { BranchTimelineSettings } from "./types";
import { DEFAULT_SETTINGS } from "./settings-defaults";
import { normalizeRhythmMarkers, normalizeRhythmSchedule } from "./rhythm";
import { normalizeMentalStateLabels } from "./focus-state-model";
import { normalizeFocusColors } from "./focus-rhythm-color";
import { loadTags } from "./tags";
import { normalizeTaskHeadings } from "./vault/project-tasks";
type SavedSettings = Partial<BranchTimelineSettings> & { tagMap?: Record<string, string>; dayStartMinute?: number; dayEndMinute?: number; requireItemMetadata?: boolean; showProjectLogHeatmap?: boolean };
export function normalizeSettings(saved: SavedSettings | null): BranchTimelineSettings {
    const { tagMap, dayStartMinute, dayEndMinute, requireItemMetadata, showProjectLogHeatmap: _legacyProjectLog, ...settings } = saved || {};
    const rhythm = normalizeRhythmSchedule(saved?.rhythm, dayStartMinute, dayEndMinute);
    const rhythmLabels = { ...DEFAULT_SETTINGS.rhythmLabels, ...(saved?.rhythmLabels || {}) };
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      pluginCommentStyle: saved?.pluginCommentStyle === "obsidian" ? "obsidian" : "html",
      hidePluginCommentsInEditor: saved?.hidePluginCommentsInEditor === true,
      projectTypes: Array.isArray(saved?.projectTypes)
        ? saved.projectTypes
          .filter(item => item && typeof item.type === "string" && typeof item.color === "string")
          .map(item => ({ type: item.type.trim(), color: item.color }))
        : DEFAULT_SETTINGS.projectTypes.map(item => ({ ...item })),
      projectTaskHeadings: normalizeTaskHeadings(saved?.projectTaskHeadings),
      lifeDiaryFormats: Array.isArray(saved?.lifeDiaryFormats) ? saved.lifeDiaryFormats.filter(value => typeof value === "string") : DEFAULT_SETTINGS.lifeDiaryFormats,
      linkProjectWorkTasks: saved?.linkProjectWorkTasks === true,
      lastProjectTasks: saved?.lastProjectTasks && typeof saved.lastProjectTasks === "object" ? saved.lastProjectTasks : {},
      lastProjectTaskHeadings: saved?.lastProjectTaskHeadings && typeof saved.lastProjectTaskHeadings === "object" ? saved.lastProjectTaskHeadings : {},
      itemMetadataRequirement: metadataRequirement(saved),
      habits: Array.isArray(saved?.habits) ? saved.habits : DEFAULT_SETTINGS.habits,
      tags: Array.isArray(saved?.tags) || tagMap ? loadTags(saved?.tags, tagMap) : [],
      rhythm,
      rhythmMarkers: normalizeRhythmMarkers(saved?.rhythmMarkers, rhythm, rhythmLabels),
      rhythmLabels,
      mentalStateLabels: normalizeMentalStateLabels(saved?.mentalStateLabels),
      focusColors: normalizeFocusColors(saved?.focusColors),
      visiblePages: Array.isArray(saved?.visiblePages)
        ? [...new Set(["day" as const, ...saved.visiblePages.filter(page => page !== "day"), ...(saved.pageVisibilityVersion === 2 ? [] : ["life" as const])])]
        : DEFAULT_SETTINGS.visiblePages,
      pageVisibilityVersion: 2,
      projectOrder: Array.isArray(saved?.projectOrder) ? saved.projectOrder : [],
      pinnedProjects: Array.isArray(saved?.pinnedProjects) ? saved.pinnedProjects : [],
      collapsedProjectGroups: Array.isArray(saved?.collapsedProjectGroups) ? saved.collapsedProjectGroups : [],
      policySceneWidths: saved?.policySceneWidths && typeof saved.policySceneWidths === "object" ? saved.policySceneWidths : {},
      habitCardOrder: Array.isArray(saved?.habitCardOrder) ? saved.habitCardOrder : DEFAULT_SETTINGS.habitCardOrder,
      timerReminderMinutes: typeof saved?.timerReminderMinutes === "number" && Number.isFinite(saved.timerReminderMinutes)
        ? Math.max(0, Math.round(saved.timerReminderMinutes))
        : DEFAULT_SETTINGS.timerReminderMinutes
    };
}
function metadataRequirement(saved: (Partial<BranchTimelineSettings> & { requireItemMetadata?: boolean }) | null): BranchTimelineSettings["itemMetadataRequirement"] {
    const requirement = saved?.itemMetadataRequirement;
    if (requirement === "project" || requirement === "both") return "project";
    return "none";
  }

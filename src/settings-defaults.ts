import type { BranchTimelineSettings } from "./types";
import { DEFAULT_RHYTHM, DEFAULT_RHYTHM_MARKERS } from "./rhythm";
import { DEFAULT_FOCUS_COLORS } from "./focus-rhythm-color";
export const DEFAULT_SETTINGS: BranchTimelineSettings = {
  statePath: "99_assets/branch-timeline/state.json",
  pluginCommentStyle: "html",
  hidePluginCommentsInEditor: false,
  diaryFolder: "20_self/22-diary",
  lifeDiaryFormats: ["[event] {内容}"],
  projectFolder: "21_project",
  projectTypes: [{ type: "project", color: "#3b6ea5" }],
  projectTaskHeadings: ["任务"],
  linkProjectWorkTasks: false,
  lastProjectTasks: {},
  lastProjectTaskHeadings: {},
  itemMetadataRequirement: "none",
  habits: ["早睡", "阅读", "对话训练", "写日记"],
  tags: [],
  rhythm: { ...DEFAULT_RHYTHM },
  rhythmMarkers: DEFAULT_RHYTHM_MARKERS.map(marker => ({ ...marker })),
  rhythmLabels: { wake: "起床", napStart: "午休开始", napEnd: "午休结束", sleepPrep: "睡眠准备", sleep: "入睡" },
  rhythmElapsedMark: "↑",
  rhythmRemainingMark: "↓",
  timerReminderMinutes: 45,
  mentalStateLabels: [],
  focusColors: { ...DEFAULT_FOCUS_COLORS },
  visiblePages: ["day", "projects", "habits", "achievements", "policy", "life"],
  pageVisibilityVersion: 2,
  projectOrder: [],
  pinnedProjects: [],
  collapsedProjectGroups: [],
  policySceneWidths: {},
  habitCardOrder: ["week", "month", "sleep"]
};

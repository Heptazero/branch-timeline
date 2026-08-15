export interface BranchTimelineSettings {
  statePath: string;
  diaryFolder: string;
  projectFolder: string;
  habits: string[];
  tags: TimelineTag[];
  rhythm: RhythmSchedule;
  rhythmElapsedMark: string;
  rhythmRemainingMark: string;
  visiblePages: TimelinePage[];
  projectOrder: string[];
  pinnedProjects: string[];
  collapsedProjectGroups: string[];
}

export type TimelinePage = "day" | "projects" | "habits" | "achievements" | "policy";

export type RhythmKey = "wake" | "napStart" | "napEnd" | "sleepPrep" | "sleep";

export interface RhythmSchedule {
  wake: number;
  napStart: number;
  napEnd: number;
  sleepPrep: number;
  sleep: number;
}

export interface TimelineTag {
  id: string;
  name: string;
  category: string;
  color: string;
}

export interface TimelineBranch {
  id: string;
  name: string;
  startMin: number;
  endMin: number | null;
  side: -1 | 1;
  color: string;
  offsetX?: number;
}

export interface TimelineItem {
  id: string;
  title: string;
  kind: "todo" | "fact";
  plannedMin?: number;
  startedMin?: number;
  startMin?: number;
  endMin?: number;
  factTiming?: boolean;
  projectPath?: string;
  projectTaskId?: string;
  tagId?: string;
  tag?: string;
  note?: string;
  branchId?: string | null;
  projectBranchId?: string | null;
  milestone?: boolean;
}

export interface TimelineDayState {
  wake: number;
  napStart: number;
  napEnd: number;
  sleepPrep: number;
  sleep: number;
  wakeReal?: boolean;
  napStartReal?: boolean;
  napEndReal?: boolean;
  sleepPrepReal?: boolean;
  sleepReal?: boolean;
  /** 旧版单一午休节点，仅用于读取迁移。 */
  pivot?: number;
  /** 旧版单一午休完成状态，仅用于读取迁移。 */
  pivotReal?: boolean;
  branches: TimelineBranch[];
  items: TimelineItem[];
}

export interface BranchTimelineState {
  version: 1;
  days: Record<string, TimelineDayState>;
  projects: Record<string, ProjectTimelineState>;
  achievements: Achievement[];
  policyCards: PolicyCard[];
  policyNodes: PolicyNode[];
}

export interface Achievement {
  id: string;
  name: string;
  color: string;
  createdDate: string;
  manualDates: string[];
}

export type PolicyMode = "triggered" | "passive" | "daily" | "mechanism";
export type PolicyPeriod = "morning" | "afternoon" | "evening";

export interface PolicyCard {
  id: string;
  name: string;
  mode: PolicyMode;
  createdDate: string;
  deletedDate?: string | null;
}

export interface PolicyNode {
  id: string;
  cardId: string;
  parentId: string | null;
  period: PolicyPeriod;
  createdDate: string;
}

export interface ProjectTimelineBranch {
  id: string;
  name: string;
  startAbs: number;
  endAbs: number;
  side: -1 | 1;
  color: string;
  offsetX?: number;
  merged?: boolean;
}

export interface ProjectTimelineState {
  branches: ProjectTimelineBranch[];
}

export interface ProjectRef {
  path: string;
  name: string;
  status: string;
  color?: string;
}

export interface DiaryDaySnapshot {
  habits: Record<string, boolean>;
  categories: Record<string, number>;
}

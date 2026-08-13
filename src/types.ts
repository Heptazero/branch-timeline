export interface BranchTimelineSettings {
  statePath: string;
  diaryFolder: string;
  projectFolder: string;
  habits: string[];
  tagMap: Record<string, string>;
  dayStartMinute: number;
  dayEndMinute: number;
}

export interface TimelineBranch {
  id: string;
  name: string;
  startMin: number;
  endMin: number | null;
  side: -1 | 1;
  color: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  kind: "todo" | "fact";
  plannedMin?: number;
  startMin?: number;
  endMin?: number;
  projectPath?: string;
  projectTaskId?: string;
  tag?: string;
  note?: string;
  branchId?: string | null;
}

export interface TimelineDayState {
  wake: number;
  sleep: number;
  pivot: number;
  branches: TimelineBranch[];
  items: TimelineItem[];
}

export interface BranchTimelineState {
  version: 1;
  days: Record<string, TimelineDayState>;
  policyNodes: unknown[];
}

export interface ProjectRef {
  path: string;
  name: string;
  status: string;
}

export interface DiaryDaySnapshot {
  habits: Record<string, boolean>;
  categories: Record<string, number>;
}

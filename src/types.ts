export interface BranchTimelineSettings {
  statePath: string;
  diaryFolder: string;
  projectFolder: string;
  habits: string[];
  tags: TimelineTag[];
  dayStartMinute: number;
  dayEndMinute: number;
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
}

export interface TimelineDayState {
  wake: number;
  sleep: number;
  pivot: number;
  wakeReal?: boolean;
  pivotReal?: boolean;
  sleepReal?: boolean;
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

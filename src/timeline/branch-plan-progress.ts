import type { BranchTimelineState, TimelineDayState, TimelineItem } from "../types";
import { backfillItem, itemEnd, itemStart } from "./model";

interface PlanRecord {
  date: string;
  item: TimelineItem;
  start: number;
  end: number;
}
export interface PlanProgress {
  records: PlanRecord[];
  minutes: number;
}
export interface BranchPlanProgress {
  plans: ReadonlyMap<string, PlanProgress>;
  folded: ReadonlySet<string>;
}

export function projectBranchPlans(state: BranchTimelineState, date: string): BranchPlanProgress {
  const planned = new Map(state.days[date]?.items.filter(item => item.kind === "todo" && item.startedMin == null).map(item => [item.id, item]));
  const plans = new Map<string, PlanProgress>();
  const folded = new Set<string>();
  if (!planned.size) return { plans, folded };

  for (const [recordDate, day] of Object.entries(state.days)) {
    for (const item of day.items) {
      if (item.kind !== "fact" || item.factTiming || item.sourcePlanDate !== date || !item.sourcePlanId) continue;
      const plan = planned.get(item.sourcePlanId);
      if (!plan) continue;
      const start = itemStart(item, day.wake), end = itemEnd(item, day.wake);
      const progress = plans.get(plan.id) ?? { records: [], minutes: 0 };
      progress.records.push({ date: recordDate, item, start, end });
      progress.minutes += Math.max(0, end - start);
      plans.set(plan.id, progress);
      if (recordDate === date && !item.milestone && (item.branchId || "") === (plan.branchId || "")
        && (item.projectPath || "") === (plan.projectPath || "")) folded.add(item.id);
    }
  }
  for (const progress of plans.values()) progress.records.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return { plans, folded };
}

export function appendPlanFact(day: TimelineDayState, plan: TimelineItem, id: string, date: string, at: number, minutes?: number): void {
  if (plan.kind !== "todo" || plan.startedMin != null || (minutes == null && day.items.some(item => item.kind === "fact" && item.sourcePlanId === plan.id && item.sourcePlanDate === date))) {
    throw new Error("计划状态已变化，请刷新后重试");
  }
  const { plannedMin, plannedEndMin, milestone, projectLogId, projectLogPath, ...metadata } = plan;
  const fact: TimelineItem = { ...metadata, id, kind: "fact", startMin: at, endMin: at, factTiming: false, sourcePlanId: plan.id, sourcePlanDate: date };
  if (minutes != null) backfillItem(fact, at, minutes, day.wake);
  day.items.push(fact);
}

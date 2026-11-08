import assert from "node:assert/strict";
import test from "node:test";
import { groupProjectEntries, projectGroupZoom } from "../src/pages/project-entry-groups";
import { projectEntries } from "../src/pages/project-model";
import { appendPlanFact, projectBranchPlans } from "../src/timeline/branch-plan-progress";
import type { BranchTimelineState, ProjectTimelineBranch, TimelineItem } from "../src/types";
import { DEFAULT_RHYTHM } from "../src/rhythm";
import { defaultDay } from "../src/vault/state-store";

const date = "2026-10-29", tomorrow = "2026-10-30", path = "p.md";
const plan: TimelineItem = { id: "plan", kind: "todo", title: "读论文", plannedMin: 540, plannedEndMin: 600, projectPath: path };
function fact(id: string, minute: number, options: Partial<TimelineItem> = {}): TimelineItem {
  return { id, kind: "fact", title: id, startMin: minute, endMin: minute + 15, projectPath: path, ...options };
}
function state(today: TimelineItem[], next: TimelineItem[] = []): BranchTimelineState {
  return { version: 1, days: { [date]: { ...defaultDay(DEFAULT_RHYTHM), items: today }, [tomorrow]: { ...defaultDay(DEFAULT_RHYTHM), items: next } } } as unknown as BranchTimelineState;
}

test("plan projection groups only matching source IDs and dates, and keeps the source and actual records intact", () => {
  const source = { sourcePlanId: plan.id, sourcePlanDate: date };
  const moved = fact("moved", 760, { ...source, branchId: "side" });
  const flag = fact("flag", 770, { ...source, milestone: true });
  const data = state([plan, fact("first", 620, source), moved, flag, fact("unrelated", 630), fact("old", 640, { ...source, sourcePlanDate: "2026-10-27" })],
    [fact("later", 620, source)]);
  const snapshot = JSON.stringify(data);
  const projection = projectBranchPlans(data, date);
  assert.deepEqual([...projection.folded], ["first"]);
  const progress = projection.plans.get(plan.id)!;
  assert.equal(progress.minutes, 60);
  assert.deepEqual(progress.records.map(record => record.item.id), ["first", "moved", "flag", "later"]);
  assert.equal(projectBranchPlans(data, tomorrow).plans.size, 0);
  assert.equal(JSON.stringify(data), snapshot);
  data.days[date].items.shift();
  assert.equal(projectBranchPlans(data, date).folded.size, 0);
});

test("project groups respect lanes, preserve milestones and do not chain beyond a marker", () => {
  const branch = { id: "side" } as ProjectTimelineBranch;
  const entries = projectEntries(state([
    fact("first", 600), fact("second", 610), fact("flag", 610, { milestone: true }),
    fact("third", 620, { projectBranchId: "missing" }), fact("side", 625, { projectBranchId: branch.id }),
    fact("fourth", 950), fact("fifth", 1250)
  ]), path);
  const groups = groupProjectEntries(entries, [branch], 70);
  assert.deepEqual(groups.map(group => group.entries.map(entry => entry.item.id)),
    [["first", "second", "third", "fourth"], ["flag"], ["side"], ["fifth"]]);
  const zoom = projectGroupZoom(groups[0], 70)!;
  assert.ok(zoom > 70);
  assert.ok(groupProjectEntries(entries, [branch], zoom).length > groups.length);
});

test("entries that remain close even at maximum zoom can open a list", () => {
  const entries = projectEntries(state([fact("first", 600), fact("second", 600), fact("third", 610)]), path);
  const [group] = groupProjectEntries(entries, [], 900);
  assert.equal(group.entries.length, 3);
  assert.equal(projectGroupZoom(group, 900), null);
  assert.equal(projectGroupZoom(group, 100), null);
});

test("checking off a branch plan creates an actual point while retaining the original plan", () => {
  const data = state([{ ...plan, milestone: true }]);
  const day = data.days[date], before = JSON.stringify(day.items[0]);
  appendPlanFact(day, day.items[0], "checked", date, 700);
  assert.equal(JSON.stringify(day.items[0]), before);
  assert.equal(day.items[1].sourcePlanId, plan.id);
  assert.equal(day.items[1].plannedEndMin, undefined);
  assert.equal(day.items[1].milestone, undefined);
  assert.equal(day.items[1].startMin, day.items[1].endMin);
  assert.throws(() => appendPlanFact(day, day.items[0], "duplicate", date, 720));
  appendPlanFact(day, day.items[0], "backfill", date, 730, 25);
  assert.equal(JSON.stringify(day.items[0]), before);
  assert.equal(day.items[2].startMin, 705);
  assert.equal(projectBranchPlans(data, date).plans.get(plan.id)?.minutes, 25);
});

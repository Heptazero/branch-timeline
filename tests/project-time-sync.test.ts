import assert from "node:assert/strict";
import test from "node:test";
import type { BranchTimelineState } from "../src/types";
import { appendProjectLog, projectDayTotal, upsertProjectDayTotal, upsertProjectNote } from "../src/vault/format";
import { changedProjectDates, completedProjectTaskTotals, completedProjectTotals } from "../src/vault/project-time-sync";
import { removeTimelineItem } from "../src/timeline/remove-item";

test("writes one absolute project total with hours and keeps manual entries", () => {
  const source = "## log\n- 1003\n\t- [10:00] [+0.5] 手写实验\n";
  const first = upsertProjectDayTotal(source, "2026-10-03", 120);
  assert.match(first, /- 1003 \[2h\] <!-- btl:2026-10-03 -->\n\t- \[10:00\] \[\+0\.5\] 手写实验/);
  assert.equal(upsertProjectDayTotal(first, "2026-10-03", 120), first);
  const revised = upsertProjectDayTotal(first, "2026-10-03", 90);
  assert.equal(projectDayTotal(revised, "2026-10-03").minutes, 90);
  assert.match(revised, /- 1003 \[1\.5h\]/);
  const removed = upsertProjectDayTotal(revised, "2026-10-03", 0);
  assert.match(removed, /- 1003\n\t- \[10:00\] \[\+0\.5\] 手写实验/);
});

test("recognizes manual hour variants without overwriting them", () => {
  for (const token of ["[+2h]", "[+2 h]", "[2h]", "[ 2 h ]"]) {
    const source = `## log\n- 1003 ${token}\n`;
    assert.notEqual(projectDayTotal(source, "2026-10-03").kind, "absent");
    assert.throws(() => upsertProjectDayTotal(source, "2026-10-03", 120));
  }
  assert.throws(() => upsertProjectDayTotal("## log\n- 1003 [2]\n", "2026-10-03", 120));
});

test("retains a synced date header when adding later project notes", () => {
  const synced = upsertProjectDayTotal("## log\n- 1003\n", "2026-10-03", 120);
  const noted = upsertProjectNote(synced, "2026-10-03", "11:30", "", "进展");
  assert.match(noted, /- 1003 \[2h\] <!-- btl:2026-10-03 -->\n\t- 11:30 进展/);
  const worked = appendProjectLog(noted, "2026-10-03", "12:00", 0.5, "实验");
  assert.match(worked, /- 1003 \[2h\] <!-- btl:2026-10-03 -->[\s\S]*\[12:00\] 0\.5h 实验/);
});

test("blocks synchronization when handwritten hours would be counted twice", () => {
  const source = "## log\n- 1003\n\t- [10:00] [+0.5h] 手写工时\n";
  assert.equal(projectDayTotal(source, "2026-10-03").kind, "conflict");
  assert.throws(() => upsertProjectDayTotal(source, "2026-10-03", 120));
  assert.throws(() => upsertProjectDayTotal("## log\n- 1003[+1h]\n", "2026-10-03", 120));
});

test("only completed facts enter the project total and edits mark that day changed", () => {
  const before = { version: 1, days: { "2026-10-03": {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [],
    items: [{ id: "a", title: "实验", kind: "fact" as const, startMin: 600, endMin: 660, projectPath: "a.md" }]
  } }, projects: {}, achievements: [], policySides: [], policyCards: [], policyNodes: [], policyEvents: [], fixedReminders: [], fixedReminderResults: [], lifeEvents: [] } as BranchTimelineState;
  const after = structuredClone(before);
  after.days["2026-10-03"].items.push({ id: "b", title: "写作", kind: "todo", startedMin: 700, projectPath: "a.md" });
  assert.equal(completedProjectTotals(after, "2026-10-03").totals.get("a.md"), 60);
  assert.equal(completedProjectTotals(after, "2026-10-03").running, true);
  assert.deepEqual(changedProjectDates(before, after), ["2026-10-03"]);
});

test("recomputes one task total across days without counting running time", () => {
  const day = (minutes: number) => ({
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [],
    items: [{ id: `fact-${minutes}`, title: "实验", kind: "fact" as const, startMin: 600, endMin: 600 + minutes, projectPath: "a.md", projectTaskId: "task-a" }]
  });
  const state = { days: { "2026-10-02": day(45), "2026-10-03": day(75) } } as unknown as BranchTimelineState;
  state.days["2026-10-03"].items.push({ id: "running", title: "实验", kind: "fact", startMin: 800, endMin: 800, factTiming: true, projectPath: "a.md", projectTaskId: "task-a" });
  assert.equal(completedProjectTaskTotals(state, "a.md").get("task-a"), 120);
});

test("deleting a timed fact removes its marked log before removing the timeline record", async () => {
  const date = "2026-10-03";
  const state = { days: { [date]: { items: [
    { id: "fact-a", kind: "fact", projectPath: "a.md", projectLogId: "work-a" },
    { id: "fact-b", kind: "fact", projectPath: "a.md", projectLogId: "work-b" }
  ] } } };
  const calls: string[] = [];
  const plugin = {
    repository: { removeProjectWorkLog: async (_path: string, id: string, commit: () => Promise<void>) => { calls.push(id); await commit(); } },
    store: { load: async () => state, update: async (mutate: (value: typeof state) => void) => { mutate(state); } }
  } as unknown as Parameters<typeof removeTimelineItem>[0];
  await removeTimelineItem(plugin, date, "fact-a");
  assert.deepEqual(calls, ["work-a"]);
  assert.deepEqual(state.days[date].items.map(item => item.id), ["fact-b"]);
});

test("deleting a reassigned fact removes the log from its original project", async () => {
  const date = "2026-10-03";
  const state = { days: { [date]: { items: [
    { id: "fact-a", kind: "fact", projectPath: "new.md", projectLogPath: "old.md", projectLogId: "work-a" }
  ] } } };
  const calls: string[] = [];
  const plugin = {
    repository: { removeProjectWorkLog: async (path: string, _id: string, commit: () => Promise<void>) => { calls.push(path); await commit(); } },
    store: { load: async () => state, update: async (mutate: (value: typeof state) => void) => { mutate(state); } }
  } as unknown as Parameters<typeof removeTimelineItem>[0];
  await removeTimelineItem(plugin, date, "fact-a");
  assert.deepEqual(calls, ["old.md"]);
  assert.equal(state.days[date].items.length, 0);
});

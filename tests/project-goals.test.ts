import assert from "node:assert/strict";
import test from "node:test";
import type { App } from "obsidian";
import { normalizeProjectGoals, projectGoalOn, scopeExpectedFraction, setProjectGoal, weekElapsedFraction } from "../src/pages/project-goals";
import { projectTimeSummary } from "../src/pages/project-time";
import type { BranchTimelineState } from "../src/types";
import { StateStore } from "../src/vault/state-store";

const PATH = "21_project/test.md";
const state = (): BranchTimelineState => ({
  version: 1, days: {}, projects: {}, achievements: [], policyCards: [], policyNodes: [],
  policySides: [], policyEvents: [], fixedReminders: [], fixedReminderResults: [], lifeEvents: []
});

test("daily goals carry forward without rewriting past days or later changes", () => {
  const value = state();
  setProjectGoal(value, PATH, "2026-10-20", "day", 90);
  setProjectGoal(value, PATH, "2026-10-24", "day", 120);
  setProjectGoal(value, PATH, "2026-10-22", "day", 60);
  assert.equal(projectGoalOn(value, PATH, "2026-10-19", "day"), 0);
  assert.equal(projectGoalOn(value, PATH, "2026-10-21", "day"), 90);
  assert.equal(projectGoalOn(value, PATH, "2026-10-23", "day"), 60);
  assert.equal(projectGoalOn(value, PATH, "2026-10-25", "day"), 120);
});

test("weekly goals use the chosen week's Monday and carry over across year boundaries", () => {
  const value = state();
  setProjectGoal(value, PATH, "2026-12-30", "week", 840);
  assert.deepEqual(value.projects[PATH].weeklyGoalChanges, { "2026-12-28": 840 });
  assert.equal(projectGoalOn(value, PATH, "2026-12-27", "week"), 0);
  assert.equal(projectGoalOn(value, PATH, "2027-01-03", "week"), 840);
  assert.equal(projectGoalOn(value, PATH, "2027-01-06", "week"), 840);
  setProjectGoal(value, PATH, "2027-01-06", "week", 600);
  assert.equal(projectGoalOn(value, PATH, "2027-01-03", "week"), 840);
  assert.equal(projectGoalOn(value, PATH, "2027-01-07", "week"), 600);
});

test("zero remains an effective cancellation and does not revive legacy plans", () => {
  const value = state();
  value.projects[PATH] = { branches: [], dailyPlans: { "2026-10-23": 180 } };
  setProjectGoal(value, PATH, "2026-10-20", "day", 90);
  setProjectGoal(value, PATH, "2026-10-22", "day", 0);
  assert.equal(projectGoalOn(value, PATH, "2026-10-21", "day"), 90);
  assert.equal(projectGoalOn(value, PATH, "2026-10-23", "day"), 0);
  setProjectGoal(value, PATH, "2026-10-20", "week", 840);
  setProjectGoal(value, PATH, "2026-10-27", "week", 0);
  assert.equal(projectGoalOn(value, PATH, "2026-10-22", "week"), 840);
  assert.equal(projectGoalOn(value, PATH, "2026-10-29", "week"), 0);
  assert.equal(value.projects[PATH].weeklyGoalChanges?.["2026-10-26"], 0);
});

test("legacy daily plans stay exact and do not become recurring history", () => {
  const value = state();
  value.projects[PATH] = { branches: [], dailyPlans: { "2026-10-19": 60, "2026-10-21": 90 } };
  assert.equal(projectGoalOn(value, PATH, "2026-10-19", "day"), 60);
  assert.equal(projectGoalOn(value, PATH, "2026-10-20", "day"), 0);
  assert.equal(projectGoalOn(value, PATH, "2026-10-22", "day"), 0);
  setProjectGoal(value, PATH, "2026-10-23", "day", 120);
  assert.equal(projectGoalOn(value, PATH, "2026-10-20", "day"), 0);
  assert.equal(projectGoalOn(value, PATH, "2026-10-21", "day"), 90);
  assert.equal(projectGoalOn(value, PATH, "2026-10-26", "day"), 120);
});

test("a weekly target overrides daily totals and leaves actual work unchanged", () => {
  const value = state();
  value.projects[PATH] = { branches: [], dailyPlans: { "2026-10-19": 60, "2026-10-20": 90 } };
  value.days["2026-10-20"] = {
    wake: 420, napStart: 780, napEnd: 810, sleepPrep: 1470, sleep: 1530,
    branches: [], items: [{ id: "work", title: "工作", kind: "fact", startMin: 600, endMin: 675, projectPath: PATH }]
  };
  const focus = new Date(2026, 9, 20);
  assert.equal(projectTimeSummary(value, PATH, focus, "week").planned, 150);
  setProjectGoal(value, PATH, "2026-10-20", "week", 840);
  const summary = projectTimeSummary(value, PATH, focus, "week");
  assert.equal(summary.planned, 840);
  assert.equal(summary.actual, 75);
  assert.equal(summary.days.reduce((sum, day) => sum + day.planned, 0), 150);
  assert.equal(projectTimeSummary(value, PATH, focus, "day").planned, 90);
  assert.equal(projectTimeSummary(value, PATH, focus, "total").planned, 0);
});

test("normalization retains valid dates, rounded durations, and zero breakpoints", () => {
  assert.deepEqual(normalizeProjectGoals({
    dailyPlans: { "2026-10-19": 30.7, "2026-02-30": 10, invalid: 80 },
    dailyGoalChanges: { "2026-10-20": 90.2, "2026-10-21": 0, "2026-10-22": -1, "2026-10-23": Infinity },
    weeklyGoalChanges: { "2026-10-19": 840, "2026-10-26": 0 }
  }), {
    dailyPlans: { "2026-10-19": 31 },
    dailyGoalChanges: { "2026-10-20": 90, "2026-10-21": 0 },
    weeklyGoalChanges: { "2026-10-19": 840, "2026-10-26": 0 }
  });
});

test("goals survive the state store's load, update and write cycle", async () => {
  const initial = state();
  initial.projects[PATH] = {
    branches: [], dailyPlans: { "2026-10-19": 60 }, dailyGoalChanges: { "2026-10-20": 90, "2026-10-22": 0 },
    weeklyGoalChanges: { "2026-10-19": 840, "2026-10-26": 0 }
  };
  let content = JSON.stringify(initial);
  const app = { vault: { adapter: {
    exists: async () => true, read: async () => content,
    write: async (_path: string, next: string) => { content = next; }
  } } } as unknown as App;
  const store = new StateStore(app, "state.json");
  await store.update(value => { setProjectGoal(value, PATH, "2026-10-30", "day", 180); });
  const saved = await store.load();
  assert.deepEqual(saved.projects[PATH].weeklyGoalChanges, initial.projects[PATH].weeklyGoalChanges);
  assert.equal(projectGoalOn(saved, PATH, "2026-10-19", "day"), 60);
  assert.equal(projectGoalOn(saved, PATH, "2026-10-23", "day"), 0);
  assert.equal(projectGoalOn(saved, PATH, "2026-10-31", "day"), 180);
  assert.equal(projectGoalOn(saved, PATH, "2026-11-02", "week"), 0);
});

test("expected pace follows the 02:00 logical day boundary", () => {
  const focus = new Date(2026, 9, 19);
  assert.equal(weekElapsedFraction(focus, new Date(2026, 9, 19, 1, 59)), 0);
  assert.equal(weekElapsedFraction(focus, new Date(2026, 9, 19, 2)), 0);
  assert.equal(weekElapsedFraction(focus, new Date(2026, 9, 21, 14)), 2.5 / 7);
  assert.equal(weekElapsedFraction(focus, new Date(2026, 9, 26, 1, 0)), (6 + 23 / 24) / 7);
  assert.equal(weekElapsedFraction(focus, new Date(2026, 9, 26, 2)), 1);
  assert.equal(scopeExpectedFraction(new Date(2026, 9, 20), "day", new Date(2026, 9, 21, 1)), 23 / 24);
  assert.equal(scopeExpectedFraction(focus, "total", new Date(2026, 9, 20)), 0);
});

test("expected week pace uses calendar days across daylight saving changes", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    assert.equal(weekElapsedFraction(new Date(2026, 2, 2), new Date(2026, 2, 8, 14)), 6.5 / 7);
    assert.equal(weekElapsedFraction(new Date(2026, 9, 26), new Date(2026, 10, 1, 14)), 6.5 / 7);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("invalid goal dates and durations cannot mutate state", () => {
  const value = state();
  assert.throws(() => setProjectGoal(value, PATH, "2026-02-30", "day", 60), /日期/);
  assert.throws(() => setProjectGoal(value, PATH, "2026-10-20", "week", NaN), /时长/);
  assert.throws(() => setProjectGoal(value, PATH, "2026-10-20", "day", -1), /时长/);
  assert.deepEqual(value.projects, {});
});

test("monthly targets survive normalization and use actual calendar-month progress", () => {
  const project = { branches: [], monthlyGoalChanges: { "2024-02-01": 1200, "bad": 5 } };
  assert.deepEqual(normalizeProjectGoals(project).monthlyGoalChanges, { "2024-02-01": 1200 });
  const value = state(); value.projects[PATH] = project;
  const summary = projectTimeSummary(value, PATH, new Date(2024, 1, 29), "month");
  assert.equal(summary.days.length, 29); assert.equal(summary.planned, 1200);
  assert.equal(scopeExpectedFraction(new Date(2024, 1, 10), "month", new Date(2024, 1, 29, 2)), 28 / 29);
});

import assert from "node:assert/strict";
import test from "node:test";
import { nativeDashboard, nativeSetGoal, nativeCalendar } from "../src/desktop/dashboard";
import { DEFAULT_RHYTHM } from "../src/rhythm";
const catalog = JSON.stringify([{ path: "p.md", name: "项目", color: "#3159e2", status: "active" }]);
const day = (extra = {}) => ({ ...DEFAULT_RHYTHM, branches: [], items: [], ...extra });
const now = "2026-10-28T14:00:00+08:00";
const report = (state: unknown, date = "2026-10-28", scope: "day" | "week" | "total" = "week") =>
  JSON.parse(nativeDashboard(JSON.stringify(state), catalog, date, scope, now));

test("native dashboard reuses recorded exposure, goals and interruption intervals without mutating storage", () => {
  const state = { version: 1, custom: "keep", projects: { "p.md": { branches: [], weeklyGoalChanges: { "2026-10-26": 300 } } }, days: {
    "2026-10-28": day({ items: [{ id: "a", title: "任务", kind: "fact", startMin: 540, endMin: 660, projectPath: "p.md", note: "原备注" },
      { id: "b", title: "待办", kind: "todo", plannedMin: 700, projectPath: "p.md" }],
      distractions: [{ id: "d", itemId: "a", minute: 600 }, { id: "outside", minute: 800 }] })
  } };
  const before = JSON.stringify(state), value = report(state);
  assert.equal(value.totalMinutes, 120); assert.equal(value.projects[0].actual, 120);
  assert.equal(value.projects[0].planned, 300); assert.equal(value.projects[0].interval, 120);
  assert.equal(value.items[0].note, "原备注"); assert.equal(value.items.length, 2);
  assert.equal(JSON.stringify(state), before);
});

test("native active time projection excludes pauses and never double-counts a saved fact", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const state = { version: 1, days: {}, macTimer: { version: 1, active: { version: 1, id, projectPath: "p.md", title: "任务", note: "",
    startedAt: "2026-10-28T12:00:00+08:00", segments: [{ start: "2026-10-28T12:00:00+08:00", end: "2026-10-28T12:30:00+08:00" },
      { start: "2026-10-28T13:30:00+08:00" }], markers: [] } } };
  assert.equal(report(state).totalMinutes, 60);
  assert.equal(report(state).projects[0].actual, 60);
  assert.deepEqual(state.days, {});
});

test("native goal editing preserves personal data and forward-effective goal history", () => {
  const before = { version: 1, days: { "2026-10-28": day() }, custom: { keep: true }, macTimer: { version: 1, active: null },
    projects: { "p.md": { branches: [], weeklyGoalChanges: { "2026-10-19": 120, "2026-11-02": 600 } } } };
  const state = JSON.parse(nativeSetGoal(JSON.stringify(before), "p.md", "2026-10-28", "week", 300));
  assert.deepEqual(state.custom, before.custom); assert.deepEqual(state.days, before.days); assert.deepEqual(state.macTimer, before.macTimer);
  assert.equal(report(state, "2026-10-21").projects[0].planned, 120);
  assert.equal(report(state).projects[0].planned, 300);
  assert.equal(report(state, "2026-11-04").projects[0].planned, 600);
  assert.throws(() => nativeSetGoal(JSON.stringify(before), "p.md", "2026-02-30", "week", 30));
  assert.throws(() => nativeSetGoal(JSON.stringify(before), "p.md", "2026-10-28", "week", -1));
});

test("native sleep summary requires paired real markers and keeps incomplete days empty", () => {
  const state = { version: 1, days: { "2026-10-27": day({ sleep: 1500, sleepReal: true }), "2026-10-28": day({ wake: 480, wakeReal: true }), "2026-10-29": day() } };
  const value = report(state);
  assert.equal(value.sleep[0].value, "01:00"); assert.equal(value.sleep[1].value, "08:00"); assert.equal(value.sleep[2].value, "7h");
  assert.equal(value.days.filter((d: { bed: number | null }) => d.bed !== null).length, 1);
});


test("native calendar is a Monday-first 42-day heatmap and only counts recorded exposure", () => {
  const state = { version: 1, days: { "2024-02-29": day({ items: [
    { id: "a", kind: "fact", title: "工作", startMin: 540, endMin: 660 },
    { id: "overlap", kind: "fact", title: "并行", startMin: 600, endMin: 660 },
    { id: "todo", kind: "todo", title: "计划", plannedMin: 700 }
  ] }) }, personal: "keep" };
  const text = JSON.stringify(state), values = JSON.parse(nativeCalendar(text, "2024-02-21", "2024-03-01T10:00:00+08:00"));
  assert.equal(values.length, 42); assert.equal(values[0].date, "2024-01-29");
  assert.equal(values.find((value: {date: string}) => value.date === "2024-02-29").minutes, 120);
  assert.equal(values.filter((value: {minutes: number}) => value.minutes > 0).length, 1);
  assert.equal(JSON.stringify(state), text);
});
test("native calendar refuses malformed dates instead of choosing another month", () => {
  assert.throws(() => nativeCalendar('{"version":1,"days":{}}', "2026-02-30", now));
});

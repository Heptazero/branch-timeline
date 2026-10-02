import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCategoryDuration,
  appendProjectLog,
  appendProjectTask,
  createWeekSkeleton,
  dateKey,
  diaryFilePath,
  diaryHeading,
  logicalToday,
  parseDiaryDay,
  setHabitInDiary,
  setProjectTaskDone,
  upsertProjectNote
} from "../src/vault/format";
import { loadTags, tagCategoryKey } from "../src/tags";
import { countdownLabel, normalizeRhythmMarkers, normalizeRhythmSchedule, normalizeTimelineDay, rhythmProgress, rhythmProgressLabel, updateRhythmMarker } from "../src/rhythm";
import { pageDateTitle, shiftPageDate, startOfWeek } from "../src/pages/navigation";
import { policyPeriodAt } from "../src/pages/policy";
import { policyProgress } from "../src/pages/policy-progress";
import { achievementStats, normalizeAchievement, sortAchievementRecords } from "../src/pages/achievement-model";
import {
  absoluteMinute,
  pickProjectBranch,
  projectEntries,
  projectTimelineRange,
  splitAbsoluteMinute
} from "../src/pages/project-model";
import { projectPlanOn, projectTimeSummary } from "../src/pages/project-time";
import {
  backfillItem,
  computeTimelineLayout,
  itemDuration,
  pickBranch,
  snapMinute,
  timelineGaps,
  yToMinute
} from "../src/timeline/model";
import { effectiveEnergyPhases, energyPhaseBounds, materializeEnergyPhases } from "../src/timeline/energy-phases";
import { TimerService, elapsedMinutes, runningItems } from "../src/timeline/timer-service";
import type { BranchTimelineState, TimelineDayState } from "../src/types";

const date = new Date(2026, 7, 13);

test("maps dates to the existing weekly diary format", () => {
  assert.equal(diaryFilePath(date, "20_self/22-diary"), "20_self/22-diary/26_W33.md");
  assert.equal(diaryHeading(date), "Thurs_26-08-13");
  const skeleton = createWeekSkeleton(date, ["早睡", "阅读"]);
  assert.match(skeleton, /## Mon_26-08-10/);
  assert.match(skeleton, /## Sun_26-08-16/);
});

test("keeps the previous logical day before 02:00", () => {
  assert.equal(dateKey(logicalToday(new Date(2026, 7, 13, 1, 30))), "2026-08-12");
  assert.equal(dateKey(logicalToday(new Date(2026, 7, 13, 2, 0))), "2026-08-13");
});

test("moves daily pages by day and the habit page by week", () => {
  const thursday = new Date(2026, 7, 13);
  assert.equal(dateKey(shiftPageDate(thursday, "day", -1)), "2026-08-12");
  assert.equal(dateKey(shiftPageDate(thursday, "habits", -1)), "2026-08-06");
  assert.equal(dateKey(startOfWeek(thursday)), "2026-08-10");
  assert.equal(pageDateTitle(thursday, "habits"), "8/10–8/16");
});

test("assigns anchors to morning afternoon and evening", () => {
  assert.equal(policyPeriodAt(new Date(2026, 7, 13, 9, 0)), "morning");
  assert.equal(policyPeriodAt(new Date(2026, 7, 13, 14, 0)), "afternoon");
  assert.equal(policyPeriodAt(new Date(2026, 7, 13, 20, 0)), "evening");
  assert.equal(policyPeriodAt(new Date(2026, 7, 14, 1, 0)), "evening");
});

test("counts an anchor run from the latest explicit violation", () => {
  const card = { id: "focus", name: "神圣座位", mode: "mechanism" as const, createdDate: "2026-08-01" };
  const events = [
    { id: "a", cardId: "focus", nodeId: "n", date: "2026-08-10", result: "used" as const },
    { id: "b", cardId: "focus", nodeId: "n", date: "2026-08-11", result: "violation" as const },
    { id: "c", cardId: "focus", nodeId: "n2", date: "2026-08-12", result: "used" as const },
    { id: "d", cardId: "focus", nodeId: "n2", date: "2026-08-12", minute: 900, result: "used" as const }
  ];
  assert.equal(policyProgress(card, events, "2026-08-12", "2026-08-12").count, 2);
});

test("breaks a daily anchor streak on a missed historical day", () => {
  const card = { id: "sleep", name: "早睡", mode: "daily" as const, createdDate: "2026-08-01" };
  const events = [
    { id: "a", cardId: "sleep", nodeId: "n", date: "2026-08-10", result: "success" as const },
    { id: "b", cardId: "sleep", nodeId: "n", date: "2026-08-12", result: "success" as const }
  ];
  assert.equal(policyProgress(card, events, "2026-08-12", "2026-08-12").count, 1);
  assert.equal(policyProgress(card, events.slice(0, 1), "2026-08-11", "2026-08-12").count, 0);
});

test("keeps yesterday's daily streak while today is still unsettled", () => {
  const card = { id: "sleep", name: "早睡", mode: "daily" as const, createdDate: "2026-08-01" };
  const events = [
    { id: "a", cardId: "sleep", nodeId: "n", date: "2026-08-10", result: "success" as const },
    { id: "b", cardId: "sleep", nodeId: "n", date: "2026-08-11", result: "success" as const }
  ];
  assert.equal(policyProgress(card, events, "2026-08-12", "2026-08-12").count, 2);
});

test("migrates legacy achievement checks into editable records", () => {
  const achievement = normalizeAchievement({
    id: "read",
    name: "读完一本书",
    color: "#3b6ea5",
    createdDate: "2026-08-01",
    manualDates: ["2026-08-10", "2026-08-11"]
  });
  assert.deepEqual(achievement.records.map(record => [record.date, record.minute]), [
    ["2026-08-11", 720],
    ["2026-08-10", 720]
  ]);
  assert.deepEqual(achievementStats(achievement), { total: 2, current: 2, latest: achievement.records[0] });
});

test("sorts achievement records by their editable date and time", () => {
  const records = sortAchievementRecords([
    { id: "a", date: "2026-08-12", minute: 600, note: "早" },
    { id: "b", date: "2026-08-12", minute: 900, note: "晚" },
    { id: "c", date: "2026-08-11", minute: 1200, note: "昨天" }
  ]);
  assert.deepEqual(records.map(record => record.id), ["b", "a", "c"]);
});

test("toggles an exact habit without touching similarly named tasks", () => {
  const source = "## Thurs_26-08-13\n- [ ] 早睡\n- [ ] 早睡准备\n\n## Fri_26-08-14\n";
  const next = setHabitInDiary(source, "Thurs_26-08-13", "早睡", true);
  assert.match(next, /- \[x\] 早睡\n- \[ \] 早睡准备/);
});

test("keeps legacy absolute category values and sums new additive entries", () => {
  let source = "## Thurs_26-08-13\n- input [2.14]\n";
  source = appendCategoryDuration(source, "Thurs_26-08-13", "input", 0.5);
  source = appendCategoryDuration(source, "Thurs_26-08-13", "input", 0.25);
  const day = parseDiaryDay(source, "Thurs_26-08-13", []);
  assert.equal(day.categories.input, 2.89);
});

test("groups project work below the MMDD log line", () => {
  const source = "---\ntype: project\n---\n\n## log\n- 0812\n\t- old\n";
  const next = appendProjectLog(source, "0813", "14:20", 0.5, "实验");
  assert.match(next, /- 0813\n\t- \[14:20\] \[\+0.5\] 实验/);
  const ordered = appendProjectLog("## log\n- 0814\n\t- [12:00] [+1] 中午\n- 0812\n", "0813", "09:00", 0.5, "早上");
  assert.match(ordered, /- 0812\n- 0813\n\t- \[09:00\] \[\+0.5\] 早上\n- 0814/);
});

test("inserts and updates project notes in date and time order", () => {
  let source = "## log\n- 0710\n\t- 09:00 后一天\n- 0708\n\t- 08:00 前一天\n";
  source = upsertProjectNote(source, "0709", "12:00", "", "中午");
  source = upsertProjectNote(source, "0709", "07:00", "", "早上");
  assert.match(source, /- 0709\n\t- 07:00 早上\n\t- 12:00 中午\n- 0710/);
  source = upsertProjectNote(source, "0709", "07:00", "早上", "更新");
  assert.doesNotMatch(source, /07:00 早上/);
  assert.match(source, /\t- 07:00 更新/);
});

test("uses a stable block id to complete project tasks", () => {
  const created = appendProjectTask("## 任务\n\n## log\n", "精读论文", "btl-test");
  assert.match(created, /- \[ \] 精读论文 \^btl-test/);
  assert.match(setProjectTaskDone(created, "btl-test", true), /- \[x\] 精读论文 \^btl-test/);
});

test("migrates legacy tag mappings without restoring deleted tags", () => {
  const migrated = loadTags(undefined, { 工作: "work", 探索: "explore" });
  assert.deepEqual(migrated.map(tag => [tag.name, tag.category]), [["工作", "work"], ["探索", "explore"]]);
  assert.deepEqual(loadTags([], { 工作: "work" }), []);
  assert.equal(tagCategoryKey({ id: "tag-custom", name: "新标签", category: "", color: "#000000" }), "tag-custom");
});

test("lays out overlapping branches in separate reusable lanes", () => {
  const day: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, items: [],
    branches: [
      { id: "a", name: "A", startMin: 480, endMin: 600, side: 1, color: "#000000" },
      { id: "b", name: "B", startMin: 540, endMin: 660, side: 1, color: "#000000" },
      { id: "c", name: "C", startMin: 660, endMin: 720, side: 1, color: "#000000" }
    ]
  };
  const layout = computeTimelineLayout(day, 390, 1);
  assert.equal(layout.branches.get("a")?.lane, 0);
  assert.equal(layout.branches.get("b")?.lane, 1);
  assert.equal(layout.branches.get("c")?.lane, 0);
  assert.equal(pickBranch(layout, 570, layout.branches.get("b")?.x || 0), "b");
});

test("snaps timeline motion while preserving fact duration", () => {
  const day: TimelineDayState = { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, items: [], branches: [] };
  assert.equal(snapMinute(487), 485);
  assert.equal(yToMinute(day, 2, 194), 490);
  assert.equal(itemDuration({ id: "fact", title: "实验", kind: "fact", startMin: 500, endMin: 575 }, day.wake), 75);
});

test("extends running todos and facts to the current minute", () => {
  assert.equal(itemDuration({ id: "todo", title: "写作", kind: "todo", plannedMin: 500, startedMin: 520 }, 420, 575), 55);
  assert.equal(itemDuration({ id: "fact", title: "阅读", kind: "fact", startMin: 480, endMin: 480, factTiming: true }, 420, 555), 75);
});

test("starts continues and stops timers without changing previous facts", () => {
  const day: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [],
    items: [
      { id: "todo", title: "写作", kind: "todo", plannedMin: 500 },
      { id: "fact", title: "阅读", kind: "fact", startMin: 480, endMin: 540 }
    ]
  };
  const timers = new TimerService();
  timers.start(day, "todo", 560, () => "unused");
  const continued = timers.start(day, "fact", 570, () => "continued");
  assert.equal(continued?.id, "continued");
  assert.deepEqual(runningItems(day).map(item => item.id), ["continued", "todo"]);
  assert.equal(elapsedMinutes(day.items[0], day, 600), 40);
  timers.stop(day, "continued", 615);
  assert.equal(day.items.find(item => item.id === "continued")?.endMin, 615);
  assert.equal(day.items.find(item => item.id === "fact")?.endMin, 540);
  timers.complete(day, "todo", 620);
  assert.deepEqual(day.items[0], {
    id: "todo", title: "写作", kind: "fact", plannedMin: 500,
    startMin: 560, endMin: 620, factTiming: false
  });
});

test("stops a timed todo as a fact without completing the todo", () => {
  const day: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [],
    items: [{ id: "todo", title: "研究", kind: "todo", plannedMin: 500, startedMin: 560, projectPath: "21_project/test.md", projectTaskId: "task" }]
  };
  const fact = new TimerService().stopTodo(day, "todo", 605, () => "fact");
  assert.equal(day.items[0].kind, "todo");
  assert.equal(day.items[0].startedMin, undefined);
  assert.deepEqual(fact, {
    id: "fact", title: "研究", kind: "fact", plannedMin: 500,
    startMin: 560, endMin: 605, factTiming: false,
    projectPath: "21_project/test.md", projectTaskId: undefined, milestone: false
  });
});

test("backfills todos and facts upward from their end", () => {
  const todo = { id: "todo", title: "写作", kind: "todo" as const, plannedMin: 600, startedMin: 620 };
  backfillItem(todo, 700, 45, 420);
  assert.deepEqual(todo, { id: "todo", title: "写作", kind: "fact", plannedMin: 600, startMin: 655, endMin: 700, factTiming: false });

  const fact = { id: "fact", title: "阅读", kind: "fact" as const, startMin: 500, endMin: 560 };
  backfillItem(fact, 800, 30, 420);
  assert.deepEqual(fact, { id: "fact", title: "阅读", kind: "fact", startMin: 530, endMin: 560, factTiming: false });
});

test("merges recorded spans and exposes only meaningful unrecorded gaps", () => {
  const day: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [],
    items: [
      { id: "a", title: "阅读", kind: "fact", startMin: 450, endMin: 510 },
      { id: "b", title: "并行记录", kind: "fact", startMin: 480, endMin: 540 },
      { id: "c", title: "计划", kind: "todo", plannedMin: 560 },
      { id: "d", title: "正在做", kind: "todo", plannedMin: 570, startedMin: 570 }
    ]
  };
  assert.deepEqual(timelineGaps(day, 630, 630, 10), [
    { start: 420, end: 450, current: false },
    { start: 540, end: 570, current: false }
  ]);
  assert.deepEqual(timelineGaps(day, 700, 630, 10).at(-1), { start: 630, end: 700, current: false });
});

test("extends the current day canvas beyond planned sleep", () => {
  const day: TimelineDayState = { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, items: [], branches: [] };
  assert.ok(computeTimelineLayout(day, 390, 1, 1620).height > computeTimelineLayout(day, 390, 1).height);
});

test("inherits energy phases forward without rewriting previous days", () => {
  const previous = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [],
    energyPhases: [{ id: "morning", name: "清醒", at: 480, color: "#3978d3", side: -1 as const }]
  };
  const current: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: []
  };
  const days: Record<string, TimelineDayState> = { "2026-08-12": previous, "2026-08-13": current };
  assert.deepEqual(effectiveEnergyPhases(days, "2026-08-13").map(phase => phase.name), ["清醒"]);
  const editable = materializeEnergyPhases(days, "2026-08-13", current);
  editable[0].name = "下午低谷";
  assert.equal(previous.energyPhases[0].name, "清醒");
  assert.equal(effectiveEnergyPhases(days, "2026-08-14")[0].name, "下午低谷");
  current.energyPhases = [];
  assert.deepEqual(effectiveEnergyPhases(days, "2026-08-14"), []);
});

test("keeps energy phase boundaries ordered", () => {
  const phases = [
    { id: "a", name: "上午", at: 480, color: "#3978d3", side: -1 as const },
    { id: "b", name: "下午", at: 780, color: "#8a94a2", side: 1 as const },
    { id: "c", name: "晚上", at: 1200, color: "#3978d3", side: 1 as const }
  ];
  assert.deepEqual(energyPhaseBounds(phases, "b", 420, 1560), [485, 1195]);
});

test("migrates legacy nap markers without restoring sleep preparation", () => {
  const day = normalizeTimelineDay({ wake: 420, pivot: 840, pivotReal: true, sleep: 1560, branches: [], items: [] });
  assert.equal(day.napStart, 840);
  assert.equal(day.napEnd, 870);
  assert.equal(day.sleepPrep, 1500);
  assert.equal(day.napStartReal, true);
  assert.deepEqual(day.rhythmMarkers, [
    { id: "nap-start", minute: 840, real: true },
    { id: "nap-end", minute: 870, real: false }
  ]);
  const rhythm = normalizeRhythmSchedule(undefined, 420, 1560);
  assert.equal(countdownLabel(rhythm, new Date(2026, 7, 13, 23, 0)), "03:00");
  assert.equal(countdownLabel(rhythm, new Date(2026, 7, 14, 1, 15)), "00:45");
  assert.deepEqual(normalizeRhythmMarkers(undefined, rhythm).map(marker => marker.id), ["nap-start", "nap-end"]);
  assert.deepEqual(normalizeRhythmMarkers([], rhythm), []);
  assert.deepEqual(normalizeTimelineDay({ wake: 420, sleep: 1560, rhythmMarkers: [], branches: [], items: [] }).rhythmMarkers, []);
});

test("moves custom rhythm markers without crossing their neighbours", () => {
  const rhythm = normalizeRhythmSchedule();
  const markers = [
    { id: "lunch", name: "午饭", minute: 720 },
    { id: "walk", name: "散步", minute: 750 }
  ];
  assert.deepEqual(updateRhythmMarker(markers, "lunch", 900, rhythm), [
    { id: "lunch", name: "午饭", minute: 745 },
    { id: "walk", name: "散步", minute: 750 }
  ]);
});

test("shows elapsed time from wake before nap end and remaining time afterwards", () => {
  const rhythm = normalizeRhythmSchedule();
  assert.deepEqual(rhythmProgress(rhythm, new Date(2026, 7, 13, 10, 0)), { minutes: 180, mode: "elapsed" });
  assert.equal(rhythmProgressLabel(rhythm, new Date(2026, 7, 13, 10, 0)), "03:00");
  assert.deepEqual(rhythmProgress(rhythm, new Date(2026, 7, 13, 15, 0)), { minutes: 660, mode: "remaining" });
  assert.equal(rhythmProgressLabel(rhythm, new Date(2026, 7, 13, 15, 0)), "11:00");
});

test("builds a multi-day project timeline without changing item dates", () => {
  const state: BranchTimelineState = {
    version: 1,
    achievements: [],
    policyCards: [],
    policyNodes: [],
    policySides: [{ id: "policy-side-routine", name: "作息", mode: "dayparts" }],
    policyEvents: [],
    projects: {
      "21_project/test.md": {
        branches: [{ id: "branch", name: "实验", startAbs: absoluteMinute("2026-08-12", 480), endAbs: absoluteMinute("2026-08-14", 600), side: 1, color: "#000000" }]
      }
    },
    days: {
      "2026-08-12": { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [{ id: "a", title: "输入", kind: "fact", startMin: 500, endMin: 560, projectPath: "21_project/test.md" }] },
      "2026-08-13": { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [{ id: "b", title: "输出", kind: "todo", plannedMin: 600, projectPath: "21_project/test.md" }] }
    }
  };
  const entries = projectEntries(state, "21_project/test.md");
  assert.deepEqual(entries.map(entry => entry.date), ["2026-08-12", "2026-08-13"]);
  assert.deepEqual(splitAbsoluteMinute(entries[1].abs), { date: "2026-08-13", minute: 600 });
  const branch = state.projects["21_project/test.md"].branches[0];
  const range = projectTimelineRange(entries, [branch], absoluteMinute("2026-08-13", 720));
  assert.ok(range.start < entries[0].abs && range.end > entries[1].abs);
  assert.equal(pickProjectBranch(entries[1].abs, 345, [branch], 195, 150), "branch");
});

test("summarizes project time by day week and total with daily plans", () => {
  const path = "21_project/test.md";
  const state: BranchTimelineState = {
    version: 1,
    achievements: [], policyCards: [], policyNodes: [], policyEvents: [],
    policySides: [{ id: "policy-side-routine", name: "作息", mode: "dayparts" }],
    projects: { [path]: { branches: [], dailyPlans: { "2026-08-12": 60, "2026-08-13": 90 } } },
    days: {
      "2026-08-12": { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [
        { id: "a", title: "输入", kind: "fact", startMin: 500, endMin: 530, projectPath: path }
      ] },
      "2026-08-13": { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [
        { id: "b", title: "输出", kind: "fact", startMin: 600, endMin: 675, projectPath: path }
      ] }
    }
  };
  const focus = new Date(2026, 7, 12);
  assert.equal(projectPlanOn(state, path, "2026-08-12"), 60);
  assert.deepEqual(projectTimeSummary(state, path, focus, "day"), {
    actual: 30, planned: 60, days: [{ date: "2026-08-12", actual: 30, planned: 60 }]
  });
  const week = projectTimeSummary(state, path, focus, "week");
  assert.equal(week.actual, 105);
  assert.equal(week.planned, 150);
  assert.equal(week.days.length, 7);
  assert.deepEqual(projectTimeSummary(state, path, focus, "total"), { actual: 105, planned: 0, days: [] });
});

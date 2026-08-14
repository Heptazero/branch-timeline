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
  setProjectTaskDone
} from "../src/vault/format";
import { loadTags, tagCategoryKey } from "../src/tags";
import { countdownLabel, normalizeRhythmSchedule, normalizeTimelineDay } from "../src/rhythm";
import { pageDateTitle, shiftPageDate, startOfWeek } from "../src/pages/navigation";
import {
  absoluteMinute,
  pickProjectBranch,
  projectEntries,
  projectTimelineRange,
  splitAbsoluteMinute
} from "../src/pages/project-model";
import {
  computeTimelineLayout,
  itemDuration,
  pickBranch,
  snapMinute,
  yToMinute
} from "../src/timeline/model";
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

test("migrates the legacy single nap marker and counts down to sleep preparation", () => {
  const day = normalizeTimelineDay({ wake: 420, pivot: 840, pivotReal: true, sleep: 1560, branches: [], items: [] });
  assert.equal(day.napStart, 840);
  assert.equal(day.napEnd, 870);
  assert.equal(day.sleepPrep, 1500);
  assert.equal(day.napStartReal, true);
  const rhythm = normalizeRhythmSchedule(undefined, 420, 1560);
  assert.equal(countdownLabel(rhythm, new Date(2026, 7, 13, 23, 0)), "02:00");
  assert.equal(countdownLabel(rhythm, new Date(2026, 7, 14, 1, 15)), "+00:15");
});

test("builds a multi-day project timeline without changing item dates", () => {
  const state: BranchTimelineState = {
    version: 1,
    achievements: [],
    policyCards: [],
    policyNodes: [],
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

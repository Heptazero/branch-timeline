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
import { loadTags } from "../src/tags";
import {
  computeTimelineLayout,
  itemDuration,
  pickBranch,
  snapMinute,
  yToMinute
} from "../src/timeline/model";
import type { TimelineDayState } from "../src/types";

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
});

test("lays out overlapping branches in separate reusable lanes", () => {
  const day: TimelineDayState = {
    wake: 420, sleep: 1560, pivot: 840, items: [],
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
  const day: TimelineDayState = { wake: 420, sleep: 1560, pivot: 840, items: [], branches: [] };
  assert.equal(snapMinute(487), 485);
  assert.equal(yToMinute(day, 2, 194), 490);
  assert.equal(itemDuration({ id: "fact", title: "实验", kind: "fact", startMin: 500, endMin: 575 }, day.wake), 75);
});

test("extends running todos and facts to the current minute", () => {
  assert.equal(itemDuration({ id: "todo", title: "写作", kind: "todo", plannedMin: 500, startedMin: 520 }, 420, 575), 55);
  assert.equal(itemDuration({ id: "fact", title: "阅读", kind: "fact", startMin: 480, endMin: 480, factTiming: true }, 420, 555), 75);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCategoryDuration,
  appendProjectLog,
  appendProjectTask,
  createWeekSkeleton,
  diaryFilePath,
  diaryHeading,
  parseDiaryDay,
  setHabitInDiary,
  setProjectTaskDone
} from "../src/vault/format";

const date = new Date(2026, 7, 13);

test("maps dates to the existing weekly diary format", () => {
  assert.equal(diaryFilePath(date, "20_self/22-diary"), "20_self/22-diary/26_W33.md");
  assert.equal(diaryHeading(date), "Thurs_26-08-13");
  const skeleton = createWeekSkeleton(date, ["早睡", "阅读"]);
  assert.match(skeleton, /## Mon_26-08-10/);
  assert.match(skeleton, /## Sun_26-08-16/);
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

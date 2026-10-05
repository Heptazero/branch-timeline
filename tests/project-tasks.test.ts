import assert from "node:assert/strict";
import test from "node:test";
import { appendProjectLog, setProjectTaskDone, updateProjectWorkLogNote } from "../src/vault/format";
import { appendProjectTaskAtHeading, ensureProjectTaskId, indexProjectTasks, normalizeTaskHeadings, upsertProjectTaskTotals } from "../src/vault/project-tasks";

test("finds open tasks below multiple configured headings and nested headings", () => {
  const source = "## 任务\n- [ ] 根任务\n### 本周\n- [ ] 实验\n#### 数据\n- [ ] 整理\n- [x] 已完成\n## 日志\n- [ ] 无关\n## 清单\n- [ ] 另一个";
  const index = indexProjectTasks(source, normalizeTaskHeadings(["任务", "清单"]));
  assert.deepEqual(index.tasks.map(task => [task.title, task.headingPath.join(" / ")]), [
    ["根任务", "任务"], ["实验", "任务 / 本周"], ["整理", "任务 / 本周 / 数据"], ["另一个", "清单"]
  ]);
  assert.deepEqual(index.headings.map(heading => [heading.title, heading.depth]), [["任务", 0], ["本周", 1], ["数据", 2], ["清单", 0]]);
});

test("does not treat code examples as task headings or tasks", () => {
  const source = "## 任务\n```md\n### 示例\n- [ ] 假任务\n```\n- [ ] 真任务\n";
  assert.deepEqual(indexProjectTasks(source, ["任务"]).tasks.map(task => task.title), ["真任务"]);
});

test("completes the exact task id while preserving its list marker", () => {
  const source = "## 任务\n* [ ] A ^btl-1\n- [ ] B ^btl-12\n";
  const next = setProjectTaskDone(source, "btl-1", true);
  assert.match(next, /\* \[x\] A \^btl-1/);
  assert.match(next, /- \[ \] B \^btl-12/);
});

test("adds a task to its selected heading without spilling into a child", () => {
  const source = "## 任务\n- [ ] 原有\n### 本周\n- [ ] 实验\n## log\n";
  const heading = indexProjectTasks(source, ["任务"]).headings[0];
  const next = appendProjectTaskAtHeading(source, "新任务", "btl-new", heading.key, ["任务"]);
  assert.match(next, /- \[ \] 原有\n- \[ \] 新任务 \^btl-new\n### 本周/);
});

test("gives a selected handwritten task an id and owns only its cumulative suffix", () => {
  const source = "## 任务\n- [ ] 实验\n- [ ] 读书\n";
  const task = indexProjectTasks(source, ["任务"]).tasks[0];
  const linked = ensureProjectTaskId(source, task, "btl-one");
  assert.match(linked, /- \[ \] 实验 \^btl-one/);
  const total = upsertProjectTaskTotals(linked, new Map([["btl-one", 90]]));
  assert.match(total, /- \[ \] 实验 （累计 1\.5h） <!-- btl-task-total:btl-one --> \^btl-one/);
  assert.match(total, /- \[ \] 读书/);
  assert.equal(upsertProjectTaskTotals(total, new Map([["btl-one", 90]])), total);
  assert.doesNotMatch(upsertProjectTaskTotals(total, new Map()), /累计/);
  assert.throws(() => upsertProjectTaskTotals("## 任务\n- [ ] 实验 （累计 2h） ^btl-one", new Map([["btl-one", 90]])));
});

test("edits a marked work note without duplicating its dated log entry", () => {
  const logged = appendProjectLog("## log\n", "2026-08-13", "14:20", 0.5, "@实验 初稿", "fact-one");
  const edited = updateProjectWorkLogNote(logged, "fact-one", "实验", "修订");
  assert.match(edited, /\[14:20\] 0\.5h @实验 修订 <!-- btl-work:fact-one -->/);
  assert.equal(edited.match(/btl-work:fact-one/g)?.length, 1);
});

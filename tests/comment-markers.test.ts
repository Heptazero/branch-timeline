import assert from "node:assert/strict";
import test from "node:test";
import { convertPluginComments } from "../src/vault/comment-markers";
import { appendProjectLog, projectDayTotal, removeProjectWorkLog, updateProjectWorkLogNote, upsertProjectDayTotal } from "../src/vault/format";
import { indexProjectTasks, upsertProjectTaskTotals } from "../src/vault/project-tasks";

test("both comment styles remain readable and new writes use the selected style", () => {
  const first = upsertProjectDayTotal("## log\n", "2026-10-16", 90, "obsidian");
  assert.match(first, /%%btl:2026-10-16%%/);
  assert.deepEqual(projectDayTotal(first, "2026-10-16"), { kind: "owned", minutes: 90, owned: true });
  const second = appendProjectLog(first, "2026-10-16", "14:00", 0.5, "试验", "work-one", "obsidian");
  assert.match(second, /%%btl-work:work-one%%/);
  const edited = updateProjectWorkLogNote(second, "work-one", "任务", "修订");
  assert.match(edited, /@任务 修订 %%btl-work:work-one%%/);
  assert.doesNotMatch(removeProjectWorkLog(edited, "work-one"), /btl-work:work-one/);

  const html = upsertProjectDayTotal("## log\n", "2026-10-16", 90);
  assert.match(upsertProjectDayTotal(html, "2026-10-16", 120, "obsidian"), /<!-- btl:2026-10-16 -->/);
});

test("task totals retain old marker style until explicitly converted", () => {
  const source = "## 任务\n- [ ] 实验 ^task-one";
  const totals = new Map([["task-one", 90]]);
  const native = upsertProjectTaskTotals(source, totals, "obsidian");
  assert.match(native, /%%btl-task-total:task-one%% \^task-one/);
  assert.equal(indexProjectTasks(native, ["任务"]).tasks[0].title, "实验");
  assert.match(upsertProjectTaskTotals(native, totals, "html"), /%%btl-task-total:task-one%%/);
});

test("conversion changes only recognized plugin-owned lines", () => {
  const source = [
    "## 任务",
    "- [ ] 实验 （累计 1.5h） <!-- btl-task-total:task-one --> ^task-one",
    "普通说明 <!-- btl-work:sample -->",
    "## log",
    "- 1016 [1.5h] <!-- btl:2026-10-16 -->",
    "\t- [14:00] 1.5h 实验 <!-- btl-work:work-one -->",
    "```md",
    "- 1016 [1.5h] <!-- btl:2026-10-16 -->",
    "```",
    "- [12:00] 1h 手写 <!-- unrelated -->"
  ].join("\n");
  const converted = convertPluginComments(source, "obsidian");
  assert.equal(converted.count, 3);
  assert.match(converted.content, /普通说明 <!-- btl-work:sample -->/);
  assert.match(converted.content, /```md\n- 1016 \[1\.5h\] <!-- btl:2026-10-16 -->\n```/);
  assert.equal(convertPluginComments(converted.content, "obsidian").count, 0);
  assert.equal(convertPluginComments(converted.content, "html").content, source);
});

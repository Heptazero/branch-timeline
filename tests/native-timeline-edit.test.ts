import assert from "node:assert/strict";
import test from "node:test";
import { nativeEditBlock } from "../src/desktop/timeline-edit";
import { nativeDashboard } from "../src/desktop/dashboard";
import { projectWorkLogEntry } from "../src/vault/format";
import { DEFAULT_RHYTHM } from "../src/rhythm";
const date = "2026-10-28", project = "---\ntype: project\nstatus: active\n---\n## log\n手写保留\n";
const base = { version: 1, days: {}, unknown: { keep: true }, desktopReceipts: { old: { status: "imported" } } };
const request = { date, id: "block-test", start: 600, end: 630, title: "阅读", note: "[[原子笔记]]", projectPath: "p.md" };
const apply = (state: unknown, req: object, md = project, settings = {}) => JSON.parse(nativeEditBlock(JSON.stringify(state), JSON.stringify(req), JSON.stringify(settings), md));

test("native block creation writes one fact, matching log and totals while preserving unknown data", () => {
  const result = apply(base, request);
  assert.deepEqual(result.state.unknown, base.unknown); assert.deepEqual(result.state.desktopReceipts, base.desktopReceipts);
  const item = result.state.days[date].items[0];
  assert.equal(item.kind, "fact"); assert.equal(item.startMin, 600); assert.equal(item.endMin, 630);
  const entry = projectWorkLogEntry(result.project, request.id)!;
  assert.equal(entry.time, "10:30"); assert.equal(entry.hours, 0.5); assert.match(entry.note, /\[\[原子笔记\]\]/);
  assert.match(result.project, /手写保留/); assert.match(result.project, /\[0.5h\]/);
  assert.throws(() => apply(result.state, request, result.project), /编号重复/);
});

test("native resize retains branch, tags, task identity and marked log details without duplicates", () => {
  const first = apply(base, request, project, { pluginCommentStyle: "obsidian" });
  const item = first.state.days[date].items[0];
  Object.assign(item, { branchId: "b", milestone: true, tagId: "t", projectTaskId: "task" });
  const expected = JSON.stringify(item), second = apply(first.state, { ...request, expected, start: 590, end: 650 }, first.project + "\n## tasks\n- [ ] 阅读 ^task\n");
  const changed = second.state.days[date].items[0], entry = projectWorkLogEntry(second.project, request.id)!;
  assert.equal(changed.branchId, "b"); assert.equal(changed.tagId, "t"); assert.equal(changed.milestone, true);
  assert.equal(changed.projectTaskId, "task"); assert.equal(entry.hours, 1); assert.equal(entry.time, "10:50");
  assert.equal(entry.style, "obsidian"); assert.match(entry.note, /阅读 — \[\[原子笔记\]\]/);
  assert.equal(second.project.split("work:block-test").length, 2);
  assert.throws(() => apply(second.state, { ...request, expected, start: 580 }, second.project), /记录已变化/);
});

test("native edits reject missing or corrupt marked logs and protect active timers", () => {
  const first = apply(base, request), item = first.state.days[date].items[0];
  const resize = { ...request, expected: JSON.stringify(item), end: 660 };
  assert.throws(() => apply(first.state, resize, project), /找不到对应/);
  assert.throws(() => apply(first.state, resize, first.project + "\n" + first.project.split("\n").find((line: string) => line.includes("btl-work:"))), /标记重复/);
  item.factTiming = true;
  assert.throws(() => apply(first.state, { ...resize, expected: JSON.stringify(item) }, first.project), /先结束计时/);
  item.kind = "todo"; item.factTiming = false; item.startedMin = 600;
  assert.throws(() => apply(first.state, { ...resize, expected: JSON.stringify(item) }, first.project), /先结束计时/);
});

test("native creation honors project and tag requirements, including current settings", () => {
  assert.throws(() => apply(base, { ...request, projectPath: "" }, project, { itemMetadataRequirement: "project" }), /选择项目/);
  assert.throws(() => apply(base, request, project, { itemMetadataRequirement: "both" }), /选择标签/);
  const result = apply(base, { ...request, tagId: "t" }, project, { itemMetadataRequirement: "both", tags: [{ id: "t", name: "选项", category: "custom" }] });
  assert.equal(result.state.days[date].items[0].tagId, "t");
  assert.equal(apply(base, { ...request, projectPath: "" }).project, project);
});

test("native block boundaries respect logical days and reject invalid dates and stale revisions", () => {
  for (const change of [{ start: 0 }, { end: 1561 }, { end: 600 }, { date: "2026-02-30" }, { start: 600.5 }]) assert.throws(() => apply(base, { ...request, ...change }));
  const result = apply(base, { ...request, start: 1500, end: 1560 });
  assert.equal(projectWorkLogEntry(result.project, request.id)?.time, "02:00");
  const item = result.state.days[date].items[0];
  const reversed = Object.fromEntries(Object.entries(item).reverse());
  assert.doesNotThrow(() => apply(result.state, { ...request, expected: JSON.stringify(reversed) }, result.project));
});

test("native projection exposes revision only for saved facts, never a running session", () => {
  const state = { version: 1, days: { [date]: { ...DEFAULT_RHYTHM, branches: [], items: [
    { id: "fact", kind: "fact", title: "已结束", startMin: 600, endMin: 660 },
    { id: "todo", kind: "todo", title: "待办", plannedMin: 700 },
    { id: "running", kind: "fact", factTiming: true, title: "计时", startMin: 600 }
  ] } } };
  const report = JSON.parse(nativeDashboard(JSON.stringify(state), "[]", date, "day", "2026-10-28T14:00:00+08:00"));
  assert.equal(report.items[0].editable, true); assert.equal(report.items[1].editable, true); assert.equal(report.items[1].plan, true); assert.equal(report.items[2].editable, false);
  assert.equal(JSON.parse(report.items[0].revision).id, "fact");
});

test("multiline notes retain their original state text and stay editable as a single marked log", () => {
  const first = apply(base, { ...request, note: "第一行\n[[第二行]]" });
  const item = first.state.days[date].items[0];
  assert.equal(item.note, "第一行\n[[第二行]]");
  assert.match(projectWorkLogEntry(first.project, request.id)!.note, /第一行 \/ \[\[第二行\]\]/);
  assert.doesNotThrow(() => apply(first.state, { ...request, expected: JSON.stringify(item), end: 660 }, first.project));
});

test("plans persist as todos, resize and move independently without recording work or logs", () => {
  const first = apply(base, { ...request, kind: "todo" });
  const item = first.state.days[date].items[0];
  assert.equal(first.project, project); assert.equal(item.kind, "todo"); assert.equal(item.plannedMin, 600);
  assert.equal(item.plannedEndMin, 630); assert.equal(item.projectLogId, undefined); assert.equal(item.startMin, undefined);
  const next = apply(first.state, { ...request, expected: JSON.stringify(item), move: true, start: 700, end: 730 });
  assert.equal(next.state.days[date].items[0].plannedMin, 700); assert.equal(next.project, project);
  const report = JSON.parse(nativeDashboard(JSON.stringify(next.state), JSON.stringify([{ path: "p.md", name: "项目", color: "#123456", status: "active" }]), date, "week", "2026-10-28T14:00:00+08:00"));
  assert.equal(report.totalMinutes, 0); assert.equal(report.projects[0].actual, 0);
  assert.equal(report.days.find((day: { date: string }) => day.date === date).projects.length, 0);
});

test("whole-block movement preserves duration, moves linked attention marks and refuses stale edits", () => {
  const first = apply(base, request), day = first.state.days[date], item = day.items[0];
  day.distractions = [{ id: "d", itemId: item.id, minute: 610 }, { id: "unrelated", minute: 612 }];
  day.goodStates = [{ id: "g", itemId: item.id, minute: 620 }];
  const next = apply(first.state, { ...request, expected: JSON.stringify(item), move: true, start: 660, end: 690 }, first.project);
  assert.equal(next.state.days[date].distractions[0].minute, 670); assert.equal(next.state.days[date].distractions[1].minute, 612);
  assert.equal(next.state.days[date].goodStates[0].minute, 680); assert.equal(projectWorkLogEntry(next.project, request.id)?.time, "11:30");
  assert.throws(() => apply(first.state, { ...request, expected: JSON.stringify(item), move: true, start: 660, end: 700 }, first.project), /保留原时长/);
});

test("direct content editing changes title and note, updates one owned log and keeps other metadata", () => {
  const first = apply(base, request, project, { pluginCommentStyle: "obsidian" });
  const item = first.state.days[date].items[0]; Object.assign(item, { branchId: "branch", milestone: true, custom: "keep" });
  const result = apply(first.state, { ...request, expected: JSON.stringify(item), updateContent: true, title: "实验", note: "第一行\n[[第二行]]", tagId: "t", end: 660 }, first.project,
    { tags: [{ id: "t", name: "专注", category: "custom" }] });
  const next = result.state.days[date].items[0], log = projectWorkLogEntry(result.project, request.id)!;
  assert.equal(next.title, "实验"); assert.equal(next.note, "第一行\n[[第二行]]"); assert.equal(next.tagId, "t");
  assert.equal(next.branchId, "branch"); assert.equal(next.custom, "keep"); assert.equal(next.milestone, true);
  assert.equal(log.note, "实验 — 第一行 / [[第二行]]"); assert.equal(log.hours, 1); assert.equal(log.style, "obsidian");
  assert.match(result.project, /手写保留/); assert.equal(result.project.match(/btl-work:block-test/g)?.length, 1);
});

test("direct reassignment moves the work line, refreshes both totals and clears old task/branch bindings", () => {
  const first = apply(base, request), item = first.state.days[date].items[0];
  Object.assign(item, { projectBranchId: "project-branch", branchId: "day-branch", projectTaskId: "task", projectTaskTitle: "旧任务", milestone: true });
  const req = { ...request, expected: JSON.stringify(item), updateContent: true, projectPath: "new.md", end: 660 };
  const result = JSON.parse(nativeEditBlock(JSON.stringify(first.state), JSON.stringify(req), "{}", first.project, project + "\n新项目正文\n"));
  const next = result.state.days[date].items[0];
  assert.equal(projectWorkLogEntry(result.project, request.id), null);
  assert.equal(projectWorkLogEntry(result.projects["new.md"], request.id)?.hours, 1);
  assert.equal(next.projectLogPath, "new.md"); assert.equal(next.projectPath, "new.md");
  assert.equal(next.projectBranchId, null); assert.equal(next.projectTaskId, undefined); assert.equal(next.projectTaskTitle, undefined);
  assert.equal(next.branchId, "day-branch"); assert.equal(next.milestone, true);
  assert.doesNotMatch(result.project, /\[0.5h\]/); assert.match(result.projects["new.md"], /\[1h\]/);
  assert.match(result.projects["new.md"], /新项目正文/); assert.match(result.project, /手写保留/);
  assert.throws(() => JSON.parse(nativeEditBlock(JSON.stringify(first.state), JSON.stringify(req), "{}", first.project, first.project)), /目标项目已有/);
});

test("direct edits enforce required metadata, allow unassignment and can log a previously unlogged fact", () => {
  const first = apply(base, request), item = first.state.days[date].items[0];
  const req = { ...request, updateContent: true, expected: JSON.stringify(item) };
  assert.throws(() => apply(first.state, { ...req, projectPath: "" }, first.project, { itemMetadataRequirement: "project" }), /选择项目/);
  assert.throws(() => apply(first.state, req, first.project, { itemMetadataRequirement: "both" }), /选择标签/);
  assert.throws(() => apply(first.state, { ...req, title: "" }, first.project), /填写标题/);
  assert.throws(() => apply(first.state, { ...req, projectPath: "../other.md" }, first.project), /项目路径/);
  const cleared = apply(first.state, { ...req, projectPath: "" }, first.project);
  assert.equal(cleared.state.days[date].items[0].projectLogId, undefined); assert.equal(projectWorkLogEntry(cleared.project, request.id), null);
  const unlogged = cleared.state.days[date].items[0];
  const assigned = JSON.parse(nativeEditBlock(JSON.stringify(cleared.state), JSON.stringify({ ...req, expected: JSON.stringify(unlogged) }), "{}", "", project));
  assert.equal(assigned.state.days[date].items[0].projectLogPath, "p.md"); assert.ok(projectWorkLogEntry(assigned.projects["p.md"], request.id));
});

test("direct plan edits keep their identity, remain plans and never write work logs", () => {
  const first = apply(base, { ...request, kind: "todo" }), item = first.state.days[date].items[0];
  const result = apply(first.state, { ...request, expected: JSON.stringify(item), updateContent: true, title: "新计划", note: "细节", projectPath: "new.md" });
  assert.equal(result.state.days[date].items.length, 1); assert.equal(result.state.days[date].items[0].kind, "todo");
  assert.equal(result.state.days[date].items[0].title, "新计划"); assert.equal(result.state.days[date].items[0].projectPath, "new.md");
  assert.equal(result.project, project); assert.deepEqual(result.projects, {});
});

test("direct content editing preserves extra handwritten prose in the owned log", () => {
  const first = apply(base, request), item = first.state.days[date].items[0];
  const handwritten = first.project.replace("阅读 — [[原子笔记]]", "阅读 — [[原子笔记]] — 手工补充");
  const result = apply(first.state, { ...request, expected: JSON.stringify(item), updateContent: true, title: "新标题" }, handwritten);
  assert.equal(projectWorkLogEntry(result.project, request.id)?.note, "新标题 — [[原子笔记]] — 手工补充");
  const independentlyWritten = first.project.replace("阅读 — [[原子笔记]]", "完全手工写的内容");
  const retained = apply(first.state, { ...request, expected: JSON.stringify(item), updateContent: true, title: "新标题" }, independentlyWritten);
  assert.match(projectWorkLogEntry(retained.project, request.id)!.note, /完全手工写的内容/);
});

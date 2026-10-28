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
  item.kind = "todo"; item.factTiming = false;
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
  assert.equal(report.items[0].editable, true); assert.equal(report.items[1].editable, false); assert.equal(report.items[2].editable, false);
  assert.equal(JSON.parse(report.items[0].revision).id, "fact");
});

test("multiline notes retain their original state text and stay editable as a single marked log", () => {
  const first = apply(base, { ...request, note: "第一行\n[[第二行]]" });
  const item = first.state.days[date].items[0];
  assert.equal(item.note, "第一行\n[[第二行]]");
  assert.match(projectWorkLogEntry(first.project, request.id)!.note, /第一行 \/ \[\[第二行\]\]/);
  assert.doesNotThrow(() => apply(first.state, { ...request, expected: JSON.stringify(item), end: 660 }, first.project));
});

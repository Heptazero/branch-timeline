import assert from "node:assert/strict";
import test from "node:test";
import type { TimelineItem } from "../src/types";
import { nativePreparePlan } from "../src/desktop/plan-timer";
import { finishSharedSession } from "../src/desktop/shared-session";
const item: TimelineItem = { id: "plan", kind: "todo", title: "写解释器", projectPath: "p.md", plannedMin: 600, plannedEndMin: 660, note: "从 AST 开始", tagId: "blue", projectTaskId: "task-1", projectTaskTitle: "解释器" };
const state = () => ({ version: 1, days: { "2026-10-29": { wake: 420, napStart: 780, napEnd: 810, sleep: 1500, branches: [], items: [item] } }, custom: { keep: true } });
const id = "12345678-1234-1234-1234-123456789abc";
const source = { date: "2026-10-29" as const, id: item.id, revision: JSON.stringify(item) };
const now = "2026-10-29T10:00:00+08:00";
const session = (duration = 60) => ({ version: 1, id, projectPath: item.projectPath, title: item.title, note: item.note, sourcePlan: source,
  startedAt: "2026-10-29T02:00:00Z", endedAt: new Date(Date.parse("2026-10-29T02:00:00Z") + duration * 60000).toISOString(),
  segments: [{ start: "2026-10-29T02:00:00Z", end: new Date(Date.parse("2026-10-29T02:00:00Z") + duration * 60000).toISOString() }], markers: [] });
const finish = (value: unknown, minutes = 60) => JSON.parse(finishSharedSession(JSON.stringify(value), JSON.stringify(session(minutes)), "{}", "## 任务\n- [ ] 解释器 ^task-1\n## log\n手写保留\n"));
test("plan start inherits title, project, note and explicit duration without editing it", () => {
  const before = state(), text = JSON.stringify(before);
  const draft = JSON.parse(nativePreparePlan(text, source.date, item.id, source.revision, now));
  assert.equal(draft.title, item.title); assert.equal(draft.note, item.note); assert.equal(draft.projectPath, item.projectPath); assert.equal(draft.targetMinutes, 60);
  assert.equal(JSON.stringify(before), text);
  const point = { ...item, plannedEndMin: undefined }, plain = state(); plain.days[source.date].items = [point];
  assert.equal(JSON.parse(nativePreparePlan(JSON.stringify(plain), source.date, item.id, JSON.stringify(point), now)).targetMinutes, 0);
});
test("plan completion removes exactly its source, inherits metadata and writes one work log", () => {
  const before = state(); before.days[source.date].items = [Object.fromEntries(Object.entries(item).reverse()) as unknown as TimelineItem];
  const result = finish(before), all = Object.values(result.state.days).flatMap((day: any) => day.items);
  assert.equal(all.some((i: any) => i.id === item.id), false); assert.equal(all.length, 1);
  assert.equal((all[0] as any).title, item.title); assert.equal((all[0] as any).projectTaskId, "task-1"); assert.equal((all[0] as any).tagId, "blue");
  assert.match(result.project, /手写保留/); assert.match(result.project, /@解释器/); assert.match(result.project, /- \[x\] 解释器/);
  assert.deepEqual(result.state.custom, before.custom);
  const repeated = JSON.parse(finishSharedSession(JSON.stringify(result.state), JSON.stringify(session()), "{}", result.project));
  assert.deepEqual(repeated.state, result.state); assert.equal(repeated.project, result.project);
});
test("conflicts stop plan completion, removed plans stay removed, short sessions retain the plan", () => {
  const changed = state(); changed.days[source.date].items = [{ ...item, title: "别处改过" }];
  assert.throws(() => finish(changed), /原计划已在别处修改/);
  const removed = state(); removed.days[source.date].items = []; assert.equal(finish(removed).state.days[source.date].items.some((i: any) => i.id === item.id), false);
  assert.equal(finish(state(), 0.5).state.days[source.date].items[0].id, item.id);
});
test("stale plans and concurrent native or current-day branch timers cannot start another session", () => {
  assert.throws(() => nativePreparePlan(JSON.stringify(state()), source.date, item.id, JSON.stringify({ ...item, title: "旧标题" }), now), /计划已变化/);
  const native = { ...state(), macTimer: { version: 1, active: { id } } };
  assert.throws(() => nativePreparePlan(JSON.stringify(native), source.date, item.id, source.revision, now), /当前计时/);
  const legacy = state(); legacy.days[source.date].items.push({ id: "other", kind: "todo", title: "旧计时", startedMin: 610 });
  assert.throws(() => nativePreparePlan(JSON.stringify(legacy), source.date, item.id, source.revision, now), /分支时间线/);
});
test("oversized plan notes cannot create an unfinishable timer", () => {
  const value = state(); value.days[source.date].items = [{ ...item, note: "x".repeat(20_001) }];
  assert.throws(() => nativePreparePlan(JSON.stringify(value), source.date, item.id, JSON.stringify(value.days[source.date].items[0]), now), /备注过长/);
});
test("multiline inherited notes remain intact in facts and form one owned log entry", () => {
  const value = state(), record = { ...item, note: "第一行\n第二行" }; value.days[source.date].items = [record];
  const run = { ...session(), note: record.note, sourcePlan: { ...source, revision: JSON.stringify(record) } };
  const result = JSON.parse(finishSharedSession(JSON.stringify(value), JSON.stringify(run), "{}", "## 任务\n- [ ] 解释器 ^task-1\n## log\n手写保留\n"));
  assert.match(result.project, /第一行 \/ 第二行/); assert.equal(result.state.days[source.date].items[0].note, record.note);
});

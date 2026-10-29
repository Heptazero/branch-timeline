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
test("plan start always counts up, inherits metadata and leaves planned duration untouched", () => {
  const before = state(), text = JSON.stringify(before);
  const draft = JSON.parse(nativePreparePlan(text, source.date, item.id, source.revision, now));
  assert.equal(draft.title, item.title); assert.equal(draft.note, item.note); assert.equal(draft.projectPath, item.projectPath); assert.equal(draft.targetMinutes, 0);
  assert.equal(JSON.stringify(before), text);
  const point = { ...item, plannedEndMin: undefined }, plain = state(); plain.days[source.date].items = [point];
  assert.equal(JSON.parse(nativePreparePlan(JSON.stringify(plain), source.date, item.id, JSON.stringify(point), now)).targetMinutes, 0);
});
test("ending plan timing keeps its source unchanged, inherits metadata and writes one work log", () => {
  const before = state(); before.days[source.date].items = [Object.fromEntries(Object.entries(item).reverse()) as unknown as TimelineItem];
  const result = finish(before), all = Object.values(result.state.days).flatMap((day: any) => day.items);
  assert.deepEqual(result.state.days[source.date].items.find((i: any) => i.id === item.id), before.days[source.date].items[0]); assert.equal(all.length, 2);
  const fact = all.find((i: any) => i.kind === "fact") as any;
  assert.equal(fact.sourcePlanId, item.id); assert.equal(fact.sourcePlanDate, source.date); assert.equal(fact.plannedMin, undefined); assert.equal(fact.plannedEndMin, undefined);
  assert.equal(fact.title, item.title); assert.equal(fact.projectTaskId, "task-1"); assert.equal(fact.tagId, "blue");
  assert.match(result.project, /手写保留/); assert.match(result.project, /@解释器/); assert.match(result.project, /- \[ \] 解释器/);
  assert.deepEqual(result.state.custom, before.custom);
  const repeated = JSON.parse(finishSharedSession(JSON.stringify(result.state), JSON.stringify(session()), "{}", result.project));
  assert.deepEqual(repeated.state, result.state); assert.equal(repeated.project, result.project);
});
test("editing or deleting plans does not block saving actual time, and short sessions retain plans", () => {
  const changed = state(); changed.days[source.date].items = [{ ...item, title: "别处改过" }];
  const saved = finish(changed);
  assert.equal(saved.state.days[source.date].items.find((i: any) => i.id === item.id).title, "别处改过");
  assert.equal(saved.state.days[source.date].items.filter((i: any) => i.kind === "fact").length, 1);
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
  assert.match(result.project, /第一行 \/ 第二行/); assert.equal(result.state.days[source.date].items.find((i: any) => i.kind === "fact").note, record.note);
});
test("one retained plan can produce multiple actual sessions without completing its task", () => {
  const first = finish(state());
  const next = { ...session(30), id: "22345678-1234-1234-1234-123456789abc", startedAt: "2026-10-29T03:00:00Z", endedAt: "2026-10-29T03:30:00Z", segments: [{ start: "2026-10-29T03:00:00Z", end: "2026-10-29T03:30:00Z" }] };
  const second = JSON.parse(finishSharedSession(JSON.stringify(first.state), JSON.stringify(next), "{}", first.project));
  assert.deepEqual(second.state.days[source.date].items.find((i: any) => i.id === item.id), item);
  const facts = Object.values(second.state.days).flatMap((day: any) => day.items).filter((i: any) => i.kind === "fact");
  assert.equal(facts.length, 2); assert.equal(facts.every((i: any) => i.sourcePlanId === item.id && i.plannedMin === undefined), true);
  assert.match(second.project, /- \[ \] 解释器/); assert.match(second.project, /1\.5h/);
});

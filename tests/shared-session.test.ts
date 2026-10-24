import assert from "node:assert/strict";
import test from "node:test";
import { finishSharedSession } from "../src/desktop/shared-session";

const id = "12345678-1234-1234-1234-123456789abc";
const session = JSON.stringify({ version: 1, id, title: "编译器", note: "下次继续", projectPath: "p.md",
  startedAt: "2026-10-24T01:00:00.000Z", endedAt: "2026-10-24T02:00:00.000Z",
  segments: [{ start: "2026-10-24T01:00:00.000Z", end: "2026-10-24T02:00:00.000Z" }], markers: [] });
const apply = (state: unknown, project = "## log\n手写\n", imported = false) =>
  JSON.parse(finishSharedSession(JSON.stringify(state), session, "{}", project, imported));

test("direct native finish preserves all unrelated state and uses the existing log formatter", () => {
  const value = apply({ version: 1, days: {}, projects: { x: { branches: [] } }, custom: { untouched: true }, macTimer: { version: 1, active: { id } } });
  assert.deepEqual(value.state.custom, { untouched: true });
  assert.deepEqual(value.state.projects, { x: { branches: [] } });
  assert.equal(value.state.macTimer.active, null);
  assert.match(value.project, /手写/); assert.match(value.project, /编译器 — 下次继续/);
  assert.equal(Object.values(value.state.days).flatMap((day: any) => day.items).length, 1);
  assert.equal(value.state.desktopReceipts[id].seconds, 3600);
});
test("direct retry does not duplicate time or resurrect deleted facts", () => {
  const first = apply({ version: 1, days: {} });
  const second = apply(first.state, first.project);
  assert.deepEqual(second.state, first.state); assert.equal(second.project, first.project);
  first.state.days = {};
  assert.deepEqual(apply(first.state, first.project).state.days, {});
});
test("legacy imported receipt prevents resurrection and does not rewrite notes", () => {
  const result = apply({ version: 1, days: {} }, "手写不变", true);
  assert.deepEqual(result.state.days, {}); assert.equal(result.project, "手写不变");
});
test("invalid or newer shared state fails before generating edits", () => {
  for (const state of [{ version: 2, days: {} }, { version: 1 }, { version: 1, days: { bad: {} } }]) assert.throws(() => apply(state));
});

import assert from "node:assert/strict";
import test from "node:test";
import type { App } from "obsidian";
import type { UndoAction } from "../src/undo-manager";
import { StateStore } from "../src/vault/state-store";

function fixture(initial: string) {
  let content = initial;
  let writes = 0;
  let failNextWrite = false;
  const app = { vault: { adapter: {
    exists: async () => true,
    read: async () => content,
    write: async (_path: string, next: string) => {
      if (failNextWrite) { failNextWrite = false; throw new Error("disk unavailable"); }
      content = next; writes += 1;
    }
  } } } as unknown as App;
  return { store: new StateStore(app, "state.json"), get content() { return content; },
    set content(next: string) { content = next; }, get writes() { return writes; },
    failOnce() { failNextWrite = true; } };
}

test("invalid existing state stops writes rather than replacing it with empty data", async () => {
  const source = "{incomplete";
  const subject = fixture(source);
  await assert.rejects(subject.store.load(), /已停止写入/);
  await assert.rejects(subject.store.update(state => { state.days = {}; }), /已停止写入/);
  assert.equal(subject.content, source);
  assert.equal(subject.writes, 0);
});

test("a valid JSON fragment without days is not treated as a new empty state", async () => {
  const subject = fixture('{"version":1}');
  await assert.rejects(subject.store.update(state => { state.days = {}; }), /已停止写入/);
  assert.equal(subject.writes, 0);
});

test("a failed mutation does not poison later state updates", async () => {
  const subject = fixture('{"version":1,"days":{}}');
  await assert.rejects(subject.store.update(() => { throw new Error("one bad mutation"); }), /one bad mutation/);
  await subject.store.update(state => { state.lifeEvents = []; });
  assert.equal(subject.writes, 1);
});

test("a failed disk write leaves the queue usable for a later retry", async () => {
  const subject = fixture('{"version":1,"days":{}}');
  subject.failOnce();
  await assert.rejects(subject.store.update(state => { state.lifeEvents = []; }), /disk unavailable/);
  await subject.store.update(state => { state.lifeEvents = []; });
  assert.equal(subject.writes, 1);
});

test("undo refuses to overwrite state modified elsewhere", async () => {
  const subject = fixture('{"version":1,"days":{}}');
  let undo: UndoAction | undefined;
  subject.store.setUndoRecorder(action => { undo = action; });
  await subject.store.update(state => { state.lifeEvents = []; });
  subject.content += " ";
  await assert.rejects(async () => { await undo?.(); }, /已在别处改变/);
  assert.ok(subject.content.endsWith(" "));
});

test("undo restores the previous state from its compact snapshot", async () => {
  const subject = fixture('{"version":1,"days":{},"lifeEvents":[]}');
  let undo: UndoAction | undefined;
  subject.store.setUndoRecorder(action => { undo = action; });
  const updated = await subject.store.update(state => { state.lifeEvents.push({ id: "a", title: "测试", date: "2026-10-20", kind: "milestone" }); });
  updated.lifeEvents[0].title = "后来改动的对象";
  await undo?.();
  assert.deepEqual(JSON.parse(subject.content).lifeEvents, []);
});

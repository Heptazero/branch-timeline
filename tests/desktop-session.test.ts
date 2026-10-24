import assert from "node:assert/strict";
import test from "node:test";
import { desktopEntries, parseDesktopSession, type DesktopSession } from "../src/desktop/session-model";
import { importDesktopSession, type DesktopReceipt } from "../src/desktop/import-session";
import { desktopWorkLog } from "../src/desktop/session-log";
import type { BranchTimelineState } from "../src/types";

const id = "12345678-1234-1234-1234-123456789abc";
const stamp = (hour: number, minute = 0, second = 0) => new Date(2026, 9, 24, hour, minute, second).toISOString();
function session(): DesktopSession {
  return { version: 1, id, projectPath: "projects/p.md", title: "实验", note: "结果", startedAt: stamp(9), endedAt: stamp(10),
    segments: [{ start: stamp(9), end: stamp(10) }], markers: [{ id, at: stamp(9, 10), kind: "distraction", level: "medium" }] };
}
test("native sessions validate paths, segment order and marker bounds before writes", () => {
  assert.equal(parseDesktopSession(JSON.stringify(session())).id, id);
  for (const bad of [
    { ...session(), projectPath: "../secret.md" }, { ...session(), projectPath: "/tmp/p.md" },
    { ...session(), endedAt: null }, { ...session(), segments: [{ start: stamp(10), end: stamp(9) }] },
    { ...session(), markers: [{ id, at: stamp(11), kind: "good", level: "medium" }] },
    { ...session(), segments: [{ start: stamp(9), end: stamp(9, 40) }, { start: stamp(9, 30), end: stamp(10) }] }
  ]) assert.throws(() => parseDesktopSession(JSON.stringify(bad)));
});
test("native seconds split at the existing 02:00 logical-day boundary", () => {
  const value = session(); value.startedAt = stamp(1, 55); value.endedAt = stamp(2, 5);
  value.segments = [{ start: value.startedAt, end: value.endedAt }]; value.markers = [];
  const entries = desktopEntries(value);
  assert.deepEqual(entries.map(entry => [entry.date, entry.item.startMin, entry.item.endMin]), [
    ["2026-10-23", 1555, 1560], ["2026-10-24", 120, 125]
  ]);
});
test("paused time is excluded and sub-minute rounding cannot inflate each segment", () => {
  const value = session(); value.markers = [];
  value.segments = [{ start: stamp(9), end: stamp(9, 0, 30) }, { start: stamp(9, 30), end: stamp(9, 30, 30) }];
  const entries = desktopEntries(parseDesktopSession(JSON.stringify(value)));
  assert.equal(entries.reduce((sum, entry) => sum + entry.item.endMin! - entry.item.startMin!, 0), 1);
  assert.deepEqual(desktopEntries({ ...value, segments: value.segments.slice(0, 1) }), []);
});
test("markers retain project membership and deterministic fact identifiers", () => {
  const first = desktopEntries(session())[0];
  assert.equal(first.distractions[0].itemId, first.item.id);
  assert.equal(first.distractions[0].minute, 550);
  assert.equal(first.item.projectLogId, first.item.id);
  assert.deepEqual(desktopEntries(session()), desktopEntries(session()));
});
test("repeated import and missing receipt after a successful write never duplicate facts", async () => {
  const state = { days: {} } as BranchTimelineState;
  let receipt: DesktopReceipt | null = null, writes = 0, failedReceipt = true;
  const io = {
    receipt: async () => receipt, state: async () => state,
    commit: async (entry: ReturnType<typeof desktopEntries>[number]) => {
      writes++; state.days[entry.date] = { wake: 420, branches: [], items: [entry.item] } as never;
    },
    acknowledge: async (value: DesktopReceipt) => { if (failedReceipt) throw new Error("disk"); receipt = value; }
  };
  await assert.rejects(importDesktopSession(session(), io), /disk/);
  failedReceipt = false;
  await importDesktopSession(session(), io);
  await importDesktopSession(session(), io);
  state.days = {}; // Intentional later deletion must not resurrect the fact.
  await importDesktopSession(session(), io);
  assert.equal(writes, 1); assert.equal(Object.keys(state.days).length, 0);
});
test("work-log crash recovery is idempotent and refuses to overwrite edited time", () => {
  const first = desktopWorkLog("## log\n", "2026-10-24", "10:00", 60, "实验", id, "html");
  assert.equal(desktopWorkLog(first, "2026-10-24", "10:00", 60, "实验", id, "html"), first);
  const edited = first.replace("实验", "手动备注");
  assert.equal(desktopWorkLog(edited, "2026-10-24", "10:00", 60, "实验", id, "html"), edited);
  assert.throws(() => desktopWorkLog(first, "2026-10-24", "10:00", 120, "实验", id, "html"), /已被修改/);
});

test("legacy inbox honors receipts written directly to the shared state", async () => {
  let commits = 0;
  const state = { days: {}, desktopReceipts: { [id]: { status: "imported" } } } as unknown as BranchTimelineState;
  const result = await importDesktopSession(session(), {
    receipt: async () => null, state: async () => state, commit: async () => { commits++; }, acknowledge: async () => {}
  });
  assert.equal(result.status, "imported"); assert.equal(commits, 0);
});

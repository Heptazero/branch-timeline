import assert from "node:assert/strict";
import test from "node:test";
import { desktopEntries, parseDesktopSession, type DesktopSession } from "../src/desktop/session-model";
import { finishSharedSession } from "../src/desktop/shared-session";
import { nativeDashboard } from "../src/desktop/dashboard";
import { nativeEditBlock } from "../src/desktop/timeline-edit";
import { formatTime } from "../src/timeline/model";
import { projectWorkLogEntry } from "../src/vault/format";
const id = "12345678-1234-1234-1234-123456789abc";
const stamp = (seconds: number) => new Date(new Date(2026, 9, 29, 9).getTime() + seconds * 1000).toISOString();
function session(seconds: number, minimumRecordSeconds = 60): DesktopSession {
  return { version: 1, id, projectPath: "p.md", title: "阅读", note: "保留", startedAt: stamp(0), endedAt: stamp(seconds),
    segments: [{ start: stamp(0), end: stamp(seconds) }], markers: [], minimumRecordSeconds };
}
const minutes = (run: DesktopSession) => desktopEntries(run).reduce((sum, e) => sum + e.item.endMin! - e.item.startMin!, 0);
test("short timing threshold is strict, configurable, and can be disabled", () => {
  assert.equal(minutes(session(59.999)), 0);
  assert.equal(minutes(session(60)), 1);
  assert.equal(minutes(session(119, 120)), 0);
  assert.ok(Math.abs(minutes(session(15, 15)) - 0.25) < 1e-8);
  assert.ok(Math.abs(minutes(session(10, 0)) - 1 / 6) < 1e-8);
  assert.equal(minutes(session(0, 0)), 0);
});
test("threshold counts only active segments and keeps seconds without rounding each segment up", () => {
  const run = session(3600, 30);
  run.segments = [{ start: stamp(0), end: stamp(14) }, { start: stamp(300), end: stamp(315) }];
  assert.equal(minutes(run), 0);
  run.minimumRecordSeconds = 0;
  assert.ok(Math.abs(minutes(run) - 29 / 60) < 1e-8);
});
test("sub-minute sessions split at 02:00 without losing either date or increasing duration", () => {
  const run = session(30, 0), start = new Date(2026, 9, 29, 1, 59, 45).getTime();
  run.startedAt = new Date(start).toISOString(); run.endedAt = new Date(start + 30000).toISOString();
  run.segments = [{ start: run.startedAt, end: run.endedAt }];
  const entries = desktopEntries(run);
  assert.deepEqual(entries.map(e => e.date), ["2026-10-28", "2026-10-29"]);
  assert.ok(entries.every(e => Math.abs(e.item.endMin! - e.item.startMin! - 0.25) < 1e-8));
});
test("live dashboard shows running time before the discard threshold but never writes it", () => {
  const run = session(20, 300);
  const state = { version: 1, days: {}, macTimer: { version: 1, active: { ...run, endedAt: undefined, segments: [{ start: stamp(0) }] } } };
  const text = JSON.stringify(state), report = JSON.parse(nativeDashboard(text, "[]", "2026-10-29", "day", stamp(20)));
  assert.equal(report.items.length, 1); assert.ok(Math.abs(report.totalMinutes - 1 / 3) < 1e-8);
  assert.equal(JSON.stringify(state), text);
});
test("discard leaves project text untouched and a durable receipt prevents replay", () => {
  const run = session(29, 30), original = "## log\n手写内容\n";
  const state = { version: 1, days: {}, macTimer: { version: 1, active: { id } } };
  const saved = JSON.parse(finishSharedSession(JSON.stringify(state), JSON.stringify(run), "{}", original));
  assert.equal(saved.status, "too-short"); assert.deepEqual(saved.state.days, {});
  assert.equal(saved.project, original); assert.equal(saved.state.macTimer.active, null);
  assert.equal(saved.state.desktopReceipts[id].seconds, 29);
  const again = JSON.parse(finishSharedSession(JSON.stringify(saved.state), JSON.stringify({ ...run, minimumRecordSeconds: 0 }), "{}", original));
  assert.deepEqual(again.state, saved.state);
});
test("short facts write a nonzero log and retain duration when moved", () => {
  const saved = JSON.parse(finishSharedSession('{"version":1,"days":{}}', JSON.stringify(session(10, 0)), "{}", "## log\n"));
  const fact = saved.state.days["2026-10-29"].items[0], log = projectWorkLogEntry(saved.project, fact.id)!;
  assert.equal(log.time, "09:00"); assert.ok(log.hours > 0);
  assert.equal(formatTime(fact.endMin), "09:00");
  const request = { date: "2026-10-29", id: fact.id, expected: JSON.stringify(fact), start: fact.startMin + 5, end: fact.endMin + 5, move: true };
  const moved = JSON.parse(nativeEditBlock(JSON.stringify(saved.state), JSON.stringify(request), "{}", saved.project));
  const next = moved.state.days[request.date].items[0];
  assert.ok(Math.abs((next.endMin - next.startMin) * 60 - 10) < 1e-7);
  assert.ok(projectWorkLogEntry(moved.project, fact.id)!.hours > 0);
});
test("invalid seconds threshold fails validation rather than silently discarding", () => {
  for (const threshold of [-1, 1.5, 3601, "60", false]) assert.throws(() => parseDesktopSession(JSON.stringify({ ...session(30), minimumRecordSeconds: threshold })));
});

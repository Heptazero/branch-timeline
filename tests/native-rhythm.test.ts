import test from "node:test";
import assert from "node:assert/strict";
import { nativeRhythm, nativeSetRhythm } from "../src/desktop/rhythm-data";
import { normalizeSettings } from "../src/settings-state";
const date = "2026-10-29", clock = "2026-10-29T10:15:00+08:00";
const settings = JSON.stringify({ rhythm: { wake: 420, napStart: 780, napEnd: 810, sleep: 1530 }, rhythmMarkers: [{ id: "custom", name: "运动", minute: 1080 }] });
const initial = JSON.stringify({ version: 1, days: {}, macTimer: { version: 1, active: null }, custom: true });
test("rhythm completion moves only today's point, undo holds its position", () => {
  const result = nativeSetRhythm(initial, settings, date, "wake", null, clock);
  assert.equal(JSON.parse(result).days[date].wake, 615);
  const undone = nativeSetRhythm(result, settings, date, "wake", null, clock);
  assert.equal(JSON.parse(undone).days[date].wake, 615);
  assert.equal(JSON.parse(undone).days[date].wakeReal, false);
  assert.deepEqual(JSON.parse(undone).macTimer, { version: 1, active: null });
  const past = JSON.parse(nativeSetRhythm(initial, settings, "2026-10-28", "wake", null, clock));
  assert.equal(past.days["2026-10-28"].wake, 420); assert.equal(past.days["2026-10-28"].wakeReal, true);
});
test("rhythm custom markers use the same saved data and reject bad dates and times", () => {
  const value = nativeSetRhythm(initial, settings, date, "custom", 1100, clock);
  assert.equal(nativeRhythm(value, settings, date, clock).events.find(e => e.id === "custom")?.minute, 1100);
  assert.throws(() => nativeSetRhythm(value, settings, "2026-02-30", "wake", null, clock));
  assert.throws(() => nativeSetRhythm(value, settings, date, "missing", null, clock));
  assert.throws(() => nativeSetRhythm(value, settings, date, "wake", NaN, clock));
  assert.throws(() => nativeSetRhythm(value, settings, date, "wake", -1, clock));
});
test("shared settings normalization preserves user removals and custom options", () => {
  const value = normalizeSettings({ rhythmMarkers: [], visiblePages: ["day", "life"], projectTypes: [{ type: "book", color: "#123456" }], itemMetadataRequirement: "both" });
  assert.deepEqual(value.rhythmMarkers, []); assert.deepEqual(value.visiblePages, ["day", "life"]);
  assert.deepEqual(value.projectTypes, [{ type: "book", color: "#123456" }]); assert.equal(value.itemMetadataRequirement, "project");
});

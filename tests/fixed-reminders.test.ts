import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFixedReminder, reminderOn, ruleOn, isoWeekday } from "../src/fixed-reminders/model";

test("weekly reminders apply only to selected logical weekdays", () => {
  const reminder = normalizeFixedReminder({ id: "a", title: "读书", createdDate: "2026-10-12",
    rules: [{ fromDate: "2026-10-12", minute: 22 * 60, weekdays: [1, 3, 5] }] })[0];
  assert.equal(isoWeekday("2026-10-12"), 1);
  assert.equal(reminderOn(reminder, "2026-10-12")?.minute, 1320);
  assert.equal(reminderOn(reminder, "2026-10-13"), undefined);
  assert.equal(reminderOn(reminder, "2026-10-14")?.minute, 1320);
});

test("editing a rule changes future dates without rewriting earlier dates", () => {
  const reminder = normalizeFixedReminder({ id: "a", title: "休息", createdDate: "2026-10-12",
    rules: [
      { fromDate: "2026-10-12", minute: 900, weekdays: [1, 3, 5], anchorCardId: "old-anchor" },
      { fromDate: "2026-10-15", minute: 930, weekdays: [4, 6], anchorCardId: "new-anchor" }
    ] })[0];
  assert.equal(ruleOn(reminder, "2026-10-14")?.minute, 900);
  assert.equal(ruleOn(reminder, "2026-10-14")?.anchorCardId, "old-anchor");
  assert.equal(reminderOn(reminder, "2026-10-14")?.minute, 900);
  assert.equal(reminderOn(reminder, "2026-10-15")?.minute, 930);
  assert.equal(ruleOn(reminder, "2026-10-15")?.anchorCardId, "new-anchor");
  assert.equal(reminderOn(reminder, "2026-10-16"), undefined);
});

test("archiving hides future occurrences but preserves earlier results", () => {
  const reminder = normalizeFixedReminder({ id: "a", title: "运动", createdDate: "2026-10-12", archivedDate: "2026-10-14",
    rules: [{ fromDate: "2026-10-12", minute: 600, weekdays: [1, 2, 3, 4, 5, 6, 7] }] })[0];
  assert.ok(reminderOn(reminder, "2026-10-13"));
  assert.equal(reminderOn(reminder, "2026-10-14"), undefined);
});

test("invalid reminders are ignored without breaking older state", () => {
  assert.deepEqual(normalizeFixedReminder({ id: "broken", title: "", createdDate: "2026-10-12", rules: [] }), []);
});

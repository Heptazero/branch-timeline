import assert from "node:assert/strict";
import test from "node:test";
import { DailyReminderCache } from "../src/reminder-cache";

test("reminder delivery is deduplicated within a logical day and forgotten on the next day", () => {
  const cache = new DailyReminderCache();
  cache.selectDate("2026-10-20");
  assert.equal(cache.markTimer("2026-10-20:task:1"), true);
  assert.equal(cache.markTimer("2026-10-20:task:1"), false);
  assert.equal(cache.markFixed("2026-10-20:reminder"), true);
  assert.equal(cache.markFixed("2026-10-20:reminder"), false);

  cache.selectDate("2026-10-20");
  assert.equal(cache.markTimer("2026-10-20:task:1"), false);
  cache.selectDate("2026-10-21");
  assert.equal(cache.markTimer("2026-10-20:task:1"), true);
  assert.equal(cache.markFixed("2026-10-20:reminder"), true);
});

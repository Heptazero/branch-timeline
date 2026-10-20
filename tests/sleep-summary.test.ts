import assert from "node:assert/strict";
import test from "node:test";
import { sleepWeekMetrics } from "../src/pages/sleep-summary-model";
import type { BranchTimelineState, TimelineDayState } from "../src/types";

function day(values: Partial<TimelineDayState> = {}): TimelineDayState {
  return { wake: 420, napStart: 780, napEnd: 810, sleepPrep: 1440, sleep: 1500, branches: [], items: [], ...values };
}
function week(): Date[] { return Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 19 + index)); }
function state(days: Record<string, TimelineDayState>): BranchTimelineState { return { days } as BranchTimelineState; }

test("a single paired night supplies all three means and comparison with a single previous-week night", () => {
  const metrics = sleepWeekMetrics(week(), state({
    "2026-10-11": day({ sleep: 1470, sleepReal: true }), "2026-10-12": day({ wake: 480, wakeReal: true }),
    "2026-10-18": day({ sleep: 1500, sleepReal: true }), "2026-10-19": day({ wake: 420, wakeReal: true })
  }));
  assert.deepEqual(metrics, [
    { label: "平均入睡", value: "01:00", change: { text: "+30m", tone: "is-bad" } },
    { label: "平均起床", value: "07:00", change: { text: "−60m", tone: "is-neutral" } },
    { label: "平均睡眠", value: "6h", change: { text: "−90m", tone: "is-bad" } }
  ]);
});

test("sleep means stay on the same overnight axis rather than averaging midnight into noon", () => {
  const metrics = sleepWeekMetrics(week(), state({
    "2026-10-18": day({ sleep: 1500, sleepReal: true }),
    "2026-10-19": day({ wake: 420, wakeReal: true, sleep: 1380, sleepReal: true }),
    "2026-10-20": day({ wake: 420, wakeReal: true })
  }));
  assert.equal(metrics[0].value, "00:00");
  assert.equal(metrics[1].value, "07:00");
  assert.equal(metrics[2].value, "7h");
  assert.equal(metrics[0].change, null);
});

test("planned rhythm markers do not invent sleep records and empty weeks keep metrics visible", () => {
  const metrics = sleepWeekMetrics(week(), state({ "2026-10-18": day(), "2026-10-19": day({ wakeReal: true }) }));
  assert.equal(metrics.length, 3);
  assert.ok(metrics.every(metric => metric.value === "–" && metric.change === null));
});

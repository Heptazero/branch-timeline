import assert from "node:assert/strict";
import test from "node:test";
import { compareFocus, dayFocusSample, emptyFocusSample, focusHours, focusSample, interruptionInterval, type FocusSample } from "../src/pages/focus-comparison";
import type { TimelineDayState } from "../src/types";

function sample(minutes: number, load: number, distractions = load): FocusSample {
  return { minutes, load, distractions, good: 0, days: minutes ? 1 : 0 };
}

function day(minutes: number, events: number): TimelineDayState {
  return { wake: 420, napStart: 780, napEnd: 810, sleepPrep: 1440, sleep: 1500, branches: [],
    items: [{ id: "project", title: "学习", kind: "fact", startMin: 600, endMin: 600 + minutes, projectPath: "a.md" }],
    distractions: Array.from({ length: events }, (_, index) => ({ id: String(index), itemId: "project", minute: 610, level: "light" })) };
}

test("historical baseline weights elapsed time and excludes the selected week and future", () => {
  const days = { "2026-10-01": day(60, 6), "2026-10-02": day(540, 0),
    "2026-10-12": day(60, 100), "2026-10-25": day(60, 100) };
  const baseline = focusSample(days, key => key < "2026-10-12", "2026-10-20", 900);
  assert.equal(baseline.minutes, 600);
  assert.equal(baseline.load, 6);
  assert.equal(compareFocus(sample(60, 0), baseline).baselineRate, .6);
  const week = focusSample(days, key => key >= "2026-10-12" && key <= "2026-10-18", "2026-10-20", 900);
  assert.equal(week.minutes, 60);
  assert.equal(week.distractions, 100);
});

test("relative color reflects burden per recorded hour rather than raw counts", () => {
  const baseline = sample(6000, 100);
  assert.ok(compareFocus(sample(600, 5), baseline).score > .5);
  assert.ok(compareFocus(sample(60, 5), baseline).score < .5);
  assert.equal(compareFocus(sample(120, 2), baseline).score, .5);
});

test("short samples stay closer to neutral and manual blue dots never cancel interruptions", () => {
  const baseline = sample(6000, 100);
  const short = sample(15, 1);
  const long = sample(600, 40);
  assert.ok(Math.abs(compareFocus(short, baseline).score - .5) < Math.abs(compareFocus(long, baseline).score - .5));
  assert.equal(compareFocus({ ...long, good: 300 }, baseline).score, compareFocus(long, baseline).score);
});

test("missing history or recordings is neutral; no interruptions is neither infinity nor a perfect score", () => {
  const baseline = sample(6000, 100);
  assert.equal(compareFocus(emptyFocusSample(), baseline).score, .5);
  assert.equal(compareFocus(sample(120, 0), emptyFocusSample()).score, .5);
  assert.equal(compareFocus(sample(120, 0), sample(6000, 0)).score, .5);
  const quiet = compareFocus(sample(120, 0), baseline);
  assert.ok(quiet.score > .5 && quiet.score < 1);
  assert.equal(interruptionInterval(sample(120, 0)), null);
  assert.equal(interruptionInterval(sample(120, 2)), 60);
});

test("untracked interruptions do not color recorded project time and overlapping spans count once", () => {
  const recorded = day(60, 1);
  recorded.items.push({ id: "overlap", title: "实验", kind: "fact", startMin: 630, endMin: 690, projectPath: "a.md" });
  recorded.items.push({ id: "other", title: "写作", kind: "fact", startMin: 900, endMin: 960, projectPath: "b.md" });
  recorded.distractions!.push({ id: "outside", itemId: "project", minute: 1000, level: "heavy" });
  recorded.distractions!.push({ id: "other", itemId: "other", minute: 930, level: "heavy" });
  const project = dayFocusSample(recorded, undefined, "a.md");
  assert.equal(project.minutes, 90);
  assert.equal(project.load, 1);
  assert.equal(dayFocusSample(recorded).minutes, 150);
  assert.equal(dayFocusSample(recorded).load, 5);
});

test("hour labels retain small nonzero durations", () => {
  assert.equal(focusHours(120), "2h");
  assert.equal(focusHours(90), "1.5h");
  assert.equal(focusHours(1), "0.02h");
});

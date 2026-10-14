import assert from "node:assert/strict";
import test from "node:test";
import { predictFocusByTime } from "../src/focus-prediction";
import { focusPredictionDisplayScore, focusPredictionGradient } from "../src/focus-prediction-gradient";
import type { TimelineDayState } from "../src/types";

const TARGET = "2026-10-10";

function day(): TimelineDayState {
  return { wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [] };
}

function history(make: () => TimelineDayState): Record<string, TimelineDayState> {
  return Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
    const key = new Date(Date.UTC(2026, 9, index + 2)).toISOString().slice(0, 10);
    return [key, make()];
  }));
}

function point(days: Record<string, TimelineDayState>, minute: number, target = TARGET) {
  const found = predictFocusByTime(days, target).points.find(candidate => candidate.minute === minute);
  assert.ok(found);
  return found;
}

test("many completed project days create a continuous blue tendency, not blue empty hours", () => {
  const days = history(() => ({ ...day(), items: [
    { id: "work", kind: "fact", title: "研究", startMin: 600, endMin: 660, projectPath: "project.md" },
    { id: "plan", kind: "todo", title: "计划", plannedMin: 900, projectPath: "project.md" }
  ] }));
  const working = point(days, 630);
  assert.equal(working.ready, true);
  assert.ok(working.score > .68 && working.score < .75);
  assert.equal(point(days, 900).ready, false);
  assert.equal(point(days, 900).score, .5);
  const gradient = focusPredictionGradient(predictFocusByTime(days, TARGET), 420, 1560);
  assert.match(gradient || "", /^linear-gradient\(to bottom,/);
});

test("severe or frequent distractions lower quality without inventing distraction duration", () => {
  const make = (count: number) => history(() => ({ ...day(),
    items: [{ id: "work", kind: "fact", title: "研究", startMin: 600, endMin: 660, projectPath: "project.md" }],
    distractions: Array.from({ length: count }, (_, index) => ({ id: String(index), minute: 630, level: "heavy" as const }))
  }));
  assert.ok(point(make(3), 630).score < point(make(1), 630).score);
  assert.ok(point(make(1), 630).score < point(make(0), 630).score);
});

test("negative manual states outside timers can make the tendency red", () => {
  const days = history(() => ({ ...day(), mentalStates: [{ id: "fog", minute: 900, score: 0 }] }));
  const negative = point(days, 900);
  assert.equal(negative.ready, true);
  assert.ok(negative.score < .1);
  assert.equal(point(days, 630).ready, false);
});

test("no forecast from sparse days, today, future days, or discomfort alone", () => {
  const one = day();
  one.mentalStates = [{ id: "good", minute: 600, score: 100 }];
  const sparse = { "2026-10-09": one };
  assert.equal(point(sparse, 600).ready, false);
  assert.equal(focusPredictionGradient(predictFocusByTime(sparse, TARGET), 420, 1560), null);
  const days = history(() => ({ ...day(), items: [
    { id: "work", kind: "fact", title: "研究", startMin: 600, endMin: 660, projectPath: "project.md" }
  ] }));
  const baseline = point(days, 630).score;
  days[TARGET] = { ...day(), mentalStates: [{ id: "today", minute: 630, score: 0 }] };
  days["2026-10-11"] = { ...day(), mentalStates: [{ id: "future", minute: 630, score: 0 }] };
  days["2026-10-01"] = { ...day(), discomforts: [{ id: "pain", minute: 630 }] };
  assert.equal(point(days, 630).score, baseline);
});

test("forecast contrast makes a mild tendency visible without changing neutrality", () => {
  assert.equal(focusPredictionDisplayScore(.5), .5);
  assert.ok(Math.abs(focusPredictionDisplayScore(.57) - .78) < .0001);
  assert.ok(Math.abs(focusPredictionDisplayScore(.43) - .22) < .0001);
  assert.equal(focusPredictionDisplayScore(0), 0);
  assert.equal(focusPredictionDisplayScore(1), 1);
});

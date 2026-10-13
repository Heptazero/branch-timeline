import assert from "node:assert/strict";
import test from "node:test";
import { focusRailMarks, normalizeMentalStateLabels } from "../src/focus-state-model";
import { normalizeTimelineDay } from "../src/rhythm";
import type { TimelineDayState } from "../src/types";

test("project facts never imply mental state; only explicit marks appear", () => {
  const day: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [],
    items: [
      { id: "work", title: "研究", kind: "fact", startMin: 600, endMin: 660, projectPath: "research.md" },
      { id: "plan", title: "计划", kind: "todo", plannedMin: 700, projectPath: "research.md" }
    ],
    distractions: [{ id: "dip", minute: 630, level: "heavy" }],
    mentalStates: [{ id: "alert", minute: 640, score: 95, label: "清醒" }],
    discomforts: [{ id: "pain", minute: 650 }]
  };
  assert.deepEqual(focusRailMarks({ ...day, distractions: [], mentalStates: [] }), []);
  assert.deepEqual(focusRailMarks(day), [
    { minute: 630, score: 0, label: "走神" },
    { minute: 640, score: 95, label: "清醒" }
  ]);
  const normalized = normalizeTimelineDay(day);
  assert.deepEqual(normalized.mentalStates, [{ id: "alert", minute: 640, score: 95, label: "清醒" }]);
  assert.deepEqual(normalizeMentalStateLabels([{ id: "a", name: "焦虑", score: -10 }, { id: "a", name: "重复", score: 20 }]), [{ id: "a", name: "焦虑", score: 0 }]);
});

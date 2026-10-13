import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMentalStateLabels, projectFocusSpans } from "../src/focus-state-model";
import { focusRhythm } from "../src/pages/focus-stats";
import { normalizeTimelineDay } from "../src/rhythm";
import type { BranchTimelineState, TimelineDayState } from "../src/types";

test("project facts provide a medium-blue baseline while marks stay point observations", () => {
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
  assert.deepEqual(projectFocusSpans(day), [{ start: 600, end: 660 }]);
  const score = focusRhythm({ days: { "2026-08-13": day } } as unknown as BranchTimelineState, new Date(2026, 7, 13))[10];
  assert.ok(score != null && score > .5 && score < .72);
  const normalized = normalizeTimelineDay(day);
  assert.deepEqual(normalized.mentalStates, [{ id: "alert", minute: 640, score: 95, label: "清醒" }]);
  assert.deepEqual(normalizeMentalStateLabels([{ id: "a", name: "焦虑", score: -10 }, { id: "a", name: "重复", score: 20 }]), [{ id: "a", name: "焦虑", score: 0 }]);
});

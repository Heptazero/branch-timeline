import assert from "node:assert/strict";
import test from "node:test";
import { focusRailMarks, normalizeMentalStateLabels, setMentalStateMinute } from "../src/focus-state-model";
import { DEFAULT_FOCUS_COLORS, normalizeFocusColors } from "../src/focus-rhythm-color";
import { normalizeTimelineDay } from "../src/rhythm";
import type { TimelineDayState } from "../src/types";

test("project facts do not create manual status marks", () => {
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

test("custom focus colors validate per endpoint and preserve defaults", () => {
  assert.deepEqual(normalizeFocusColors(undefined), DEFAULT_FOCUS_COLORS);
  assert.deepEqual(normalizeFocusColors({ low: "#ff0033", neutral: "bad", high: "#0088FF" }), {
    low: "#ff0033", neutral: DEFAULT_FOCUS_COLORS.neutral, high: "#0088FF"
  });
});

test("editing a mental state changes only its time and stays within the logical day", () => {
  const day: TimelineDayState = {
    wake: 420, napStart: 840, napEnd: 870, sleepPrep: 1500, sleep: 1560, branches: [], items: [],
    mentalStates: [{ id: "first", minute: 600, score: 75, label: "清醒" }, { id: "second", minute: 800, score: 10 }]
  };
  setMentalStateMinute(day, "first", 1513);
  assert.deepEqual(day.mentalStates, [{ id: "first", minute: 1513, score: 75, label: "清醒" }, { id: "second", minute: 800, score: 10 }]);
  setMentalStateMinute(day, "first", 1600);
  assert.equal(day.mentalStates?.[0]?.minute, 1560);
  setMentalStateMinute(day, "missing", 500);
  assert.equal(day.mentalStates?.length, 2);
});

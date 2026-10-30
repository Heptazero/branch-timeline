import assert from "node:assert/strict";
import test from "node:test";
import { nativeDashboard } from "../src/desktop/dashboard";
import { nativeEditContext } from "../src/desktop/context-edit";
import { focusColor, predictionsForDates } from "../src/desktop/focus-context";
import { predictFocusByTime } from "../src/focus-prediction";
import { focusPredictionDisplayScore } from "../src/focus-prediction-gradient";
import { normalizeTimelineDay, DEFAULT_RHYTHM } from "../src/rhythm";
import { effectiveEnergyPhases } from "../src/timeline/energy-phases";
import type { TimelineDayState } from "../src/types";

const date = "2026-10-28", now = date + "T14:00:00+08:00";
const palette = { low: "#ff0000", neutral: "#aaaaaa", high: "#0000ff" };
const day = (extra = {}): TimelineDayState => ({ ...DEFAULT_RHYTHM, items: [], branches: [], ...extra });
const base = () => ({ version: 1, custom: { keep: true }, days: { [date]: day() } });
const edit = (state: unknown, request: object) => JSON.parse(nativeEditContext(JSON.stringify(state), "{}", JSON.stringify({ date, kind: "mental", action: "save", id: "m", minute: 600, score: 55, ...request })));
const report = (state: unknown, settings = {}) => JSON.parse(nativeDashboard(JSON.stringify(state), "[]", date, "day", now, JSON.stringify(settings)));

test("native focus projection preserves observations, colors and milestone without altering input", () => {
  const state = base(); state.days[date] = day({
    items: [{ id: "f", kind: "fact", title: "项目", startMin: 600, endMin: 660, milestone: true }],
    distractions: [{ id: "d", minute: 610, level: "heavy", itemId: "f" }],
    goodStates: [{ id: "g", minute: 620, itemId: "f" }], mentalStates: [{ id: "m", minute: 630, score: 50 }]
  });
  const text = JSON.stringify(state), result = report(state, { focusColors: palette });
  assert.equal(JSON.stringify(state), text); assert.equal(result.items[0].milestone, true);
  const marks = result.days[0].focus.marks;
  assert.deepEqual(marks.map((p: any) => [p.kind, p.color]), [["distraction", palette.low], ["good", palette.high], ["mental", palette.neutral]]);
  assert.equal(marks[0].level, "heavy"); assert.equal(JSON.parse(marks[0].revision).itemId, "f");
  assert.ok(result.days[0].focus.forecast.every((point: any) => point.color === palette.neutral && !point.ready));
});

test("native forecast equals original history model, invalidates edited history and ignores target/future", () => {
  const days = Object.fromEntries(Array.from({ length: 8 }, (_, i) => ["2026-10-" + (20 + i), day({ mentalStates: [{ id: "m", minute: 600, score: 0 }] })]));
  const first = predictionsForDates(days, [date]).get(date)!;
  assert.deepEqual(first, predictFocusByTime(days, date));
  assert.equal(first.points.find(p => p.minute === 600)?.ready, true);
  const state = { version: 1, days }, native = report(state, { focusColors: palette }).days[0].focus.forecast;
  const point = first.points.find(p => p.minute === 600)!;
  assert.equal(native.find((p: any) => p.minute === 600).color, focusColor(focusPredictionDisplayScore(point.score), palette));
  days[date] = day({ mentalStates: [{ id: "now", minute: 600, score: 100 }] });
  days["2026-10-29"] = days[date];
  assert.deepEqual(predictionsForDates(days, [date]).get(date), first);
  days["2026-10-20"].mentalStates![0].score = 100;
  assert.notDeepEqual(predictionsForDates(days, [date]).get(date), first);
  const future = "2026-10-30";
  const completed = Object.fromEntries(Object.entries(days).filter(([key]) => key < date));
  assert.deepEqual(predictionsForDates(days, [future], date).get(future), predictFocusByTime(completed, future));
});

test("native focus CRUD preserves unknown fields and requires an unchanged revision", () => {
  let state = edit(base(), { minute: 180, label: "清醒" });
  assert.equal(state.days[date].mentalStates[0].minute, 180);
  state.days[date].mentalStates[0].custom = "keep";
  const expected = JSON.stringify(state.days[date].mentalStates[0]);
  state = edit(state, { expected, minute: 1500, score: 80 });
  assert.equal(state.days[date].mentalStates[0].custom, "keep"); assert.equal(state.custom.keep, true);
  assert.throws(() => edit(state, { expected, score: 90 }), /已变化/);
  const next = edit(state, { action: "delete", expected: JSON.stringify(state.days[date].mentalStates[0]) });
  assert.deepEqual(next.days[date].mentalStates, []); assert.throws(() => edit(next, { action: "delete" }), /已变化/);
});

test("native observations reject bad input and protect linked block bounds", () => {
  for (const change of [{ date: "2026-02-30" }, { minute: 119 }, { minute: 1561 }, { score: -1 }, { score: 101 }, { id: "../x" }, { label: "x".repeat(25) }, { kind: "distraction", level: "unknown" }]) assert.throws(() => edit(base(), change));
  const state = base(); state.days[date] = day({ items: [{ id: "f", kind: "fact", title: "记录", startMin: 600, endMin: 660 }], goodStates: [{ id: "g", itemId: "f", minute: 620 }] });
  const expected = JSON.stringify(state.days[date].goodStates![0]);
  assert.throws(() => edit(state, { kind: "good", id: "g", expected, minute: 700 }), /时间块内/);
  assert.equal(edit(state, { kind: "good", id: "g", expected, minute: 630 }).days[date].goodStates[0].minute, 630);
  const severity = edit(base(), { kind: "distraction", level: "light" });
  assert.equal(report(severity).days[0].focus.marks[0].level, "light");
});

test("energy edits inherit and materialize on selected date, preserving earlier and explicit future plans", () => {
  const phases = [{ id: "a", name: "早晨", at: 420, color: "#3978d3", side: 1 }, { id: "b", name: "下午", at: 780, color: "#8a94a2", side: 1 }];
  const state = { ...base(), days: { "2026-10-27": day({ energyPhases: phases }), [date]: day(), "2026-10-30": day({ energyPhases: [] }) } };
  const next = edit(state, { kind: "energy", id: "a", label: "早晨", color: "#0088ff", minute: 450, expected: JSON.stringify(phases) });
  assert.deepEqual(next.days["2026-10-27"].energyPhases, phases);
  assert.equal(effectiveEnergyPhases(next.days, date)[0].at, 450); assert.equal(effectiveEnergyPhases(next.days, "2026-10-29")[0].at, 450);
  assert.deepEqual(effectiveEnergyPhases(next.days, "2026-10-30"), []);
  assert.equal(next.custom.keep, true); assert.throws(() => edit(next, { kind: "energy", expected: JSON.stringify(phases) }), /已变化/);
});

test("energy boundaries cannot cross, collide, or silently replace a concurrent schedule", () => {
  const phases = [{ id: "a", name: "晨", at: 420, color: "#3978d3", side: 1 }, { id: "b", name: "午", at: 780, color: "#8a94a2", side: 1 }];
  const state = base(); state.days[date] = day({ energyPhases: phases });
  const req = { kind: "energy", id: "a", label: "晨", color: "#3978d3", expected: JSON.stringify(phases) };
  assert.throws(() => edit(state, { ...req, minute: 790 }), /不能越过/);
  assert.throws(() => edit(state, { ...req, minute: 777 }), /5分钟/);
  assert.throws(() => edit(state, { ...req, color: "red" }), /颜色/);
  const next = edit(state, { ...req, action: "delete" });
  const empty = edit(next, { ...req, id: "b", action: "delete", expected: JSON.stringify(next.days[date].energyPhases) });
  assert.deepEqual(empty.days[date].energyPhases, []); assert.deepEqual(effectiveEnergyPhases(empty.days, "2026-10-29"), []);
});

test("native gaps merge overlapping facts, ignore plans and include active time", () => {
  const state = base(); state.days[date] = day({ items: [
    { id: "a", kind: "fact", title: "a", startMin: 480, endMin: 540 },
    { id: "b", kind: "fact", title: "b", startMin: 510, endMin: 600 },
    { id: "p", kind: "todo", title: "p", plannedMin: 600, plannedEndMin: 700 },
    { id: "live", kind: "fact", title: "live", startMin: 720, factTiming: true }
  ] });
  assert.deepEqual(report(state).days[0].focus.gaps, [{ start: 420, end: 480, current: false }, { start: 600, end: 720, current: false }]);
});

test("live attention points are visible but read-only and never become forecast history", () => {
  const id = "12345678-1234-1234-1234-123456789abc", marker = "12345678-1234-1234-1234-123456789def";
  const state = { ...base(), macTimer: { version: 1, active: { version: 1, id, projectPath: "p.md", title: "任务", note: "",
    startedAt: date + "T12:00:00+08:00", segments: [{ start: date + "T12:00:00+08:00" }],
    markers: [{ id: marker, at: date + "T12:30:00+08:00", kind: "good", level: "medium" }] } } };
  const text = JSON.stringify(state), context = report(state).days[0].focus;
  assert.equal(context.marks.length, 1); assert.equal(context.marks[0].kind, "good"); assert.equal(context.marks[0].editable, false);
  assert.equal(context.marks[0].minute, 750); assert.equal(JSON.stringify(state), text);
  assert.ok(context.forecast.every((p: any) => !p.ready));
  assert.throws(() => edit(state, { id: context.marks[0].recordId, kind: "good", action: "delete", expected: context.marks[0].revision }), /已变化/);
  assert.ok(context.gaps.every((gap: any) => gap.end <= 720));
});

test("old view normalization preserves state times outside planned wake and sleep", () => {
  const input = day({ sleep: 1500, mentalStates: [{ id: "m", minute: 180, score: 60 }], goodStates: [{ id: "g", minute: 1520 }], distractions: [{ id: "d", minute: 200, level: "heavy" }] });
  const next = normalizeTimelineDay(input);
  assert.equal(next.mentalStates![0].minute, 180); assert.equal(next.goodStates![0].minute, 1520); assert.equal(next.distractions![0].minute, 200);
});

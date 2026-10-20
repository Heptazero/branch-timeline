import assert from "node:assert/strict";
import test from "node:test";
import { restoreStatsNavigation, selectStatsView, timeMapTogglePresentation, toggleStatsTimeMap } from "../src/pages/stats-navigation";

test("time map opens and closes repeatedly to the originating view", () => {
  for (const view of ["project", "day", "anchor"] as const) {
    let state = restoreStatsNavigation(view, null);
    for (let repeat = 0; repeat < 3; repeat += 1) {
      state = toggleStatsTimeMap(state);
      assert.deepEqual(state, { view: "time", returnView: view });
      state = toggleStatsTimeMap(state);
      assert.deepEqual(state, { view, returnView: view });
    }
  }
});

test("legacy saved time view without a known previous view collapses to project", () => {
  for (const previous of [null, "time", "unknown"]) {
    const state = restoreStatsNavigation("time", previous);
    assert.equal(state.view, "time");
    assert.deepEqual(toggleStatsTimeMap(state), { view: "project", returnView: "project" });
  }
  assert.deepEqual(restoreStatsNavigation("unknown", "anchor"), { view: "project", returnView: "project" });
});

test("a saved return view survives reopening the page with time map expanded", () => {
  const expanded = selectStatsView(restoreStatsNavigation("day", null), "time");
  const restored = restoreStatsNavigation(expanded.view, expanded.returnView);
  assert.deepEqual(toggleStatsTimeMap(restored), { view: "day", returnView: "day" });
});

test("menu time selection preserves its return target and choosing a normal view replaces it", () => {
  let state = restoreStatsNavigation("anchor", null);
  state = selectStatsView(state, "time");
  state = selectStatsView(state, "time");
  assert.equal(state.returnView, "anchor");
  state = selectStatsView(state, "day");
  assert.deepEqual(state, { view: "day", returnView: "day" });
  state = toggleStatsTimeMap(state);
  assert.deepEqual(toggleStatsTimeMap(state), { view: "day", returnView: "day" });
});

test("time map toggle text, chevron and accessible expanded state agree", () => {
  assert.deepEqual(timeMapTogglePresentation(false), {
    text: "时间图", label: "展开一周时间图", icon: "chevron-right", expanded: "false"
  });
  assert.deepEqual(timeMapTogglePresentation(true), {
    text: "收起时间图", label: "收起一周时间图", icon: "chevron-up", expanded: "true"
  });
});

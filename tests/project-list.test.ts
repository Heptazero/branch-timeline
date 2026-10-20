import assert from "node:assert/strict";
import test from "node:test";
import { projectHours, sortProjectEntries, type ProjectListEntry } from "../src/pages/project-list-model";

function entry(path: string, type: string, actual = 60, planned = 120): ProjectListEntry {
  return { project: { path, name: path, type, status: "active" }, summary: { actual, planned, days: [] } };
}

test("small nonzero project hours and targets remain visible", () => {
  assert.equal(projectHours(0), "0 h");
  assert.equal(projectHours(1), "0.02 h");
  assert.equal(projectHours(2), "0.03 h");
  assert.equal(projectHours(90), "1.5 h");
});

test("explicit manual ordering crosses types while pinned projects remain separate", () => {
  const rows = [entry("project", "project"), entry("book", "book"), entry("pin", "project")];
  const types = [{ type: "project", color: "#123456" }, { type: "book", color: "#abcdef" }];
  const ordered = sortProjectEntries(rows, "manual", "desc", ["pin"], ["book", "project", "pin"], types);
  assert.deepEqual(ordered.map(row => row.project.path), ["pin", "book", "project"]);
});

test("projects without a target sort after measurable progress in either direction", () => {
  const rows = [entry("no goal", "project", 120, 0), entry("half", "project", 60, 120), entry("done", "project", 120, 120)];
  for (const direction of ["asc", "desc"] as const) {
    const ordered = sortProjectEntries(rows, "progress", direction, [], [], []);
    assert.equal(ordered.at(-1)?.project.path, "no goal");
  }
});

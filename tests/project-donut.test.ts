import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectDonut } from "../src/pages/project-donut";
import type { ProjectListEntry } from "../src/pages/project-list-model";

function entry(name: string, actual: number, color?: string): ProjectListEntry {
  return {
    project: { path: `${name}.md`, name, color, type: "project", status: "active" },
    summary: { actual, planned: 1000, days: [] }
  };
}

test("donut segments sum to a complete ring and total only actual minutes", () => {
  const result = buildProjectDonut([entry("a", 60, "#ff0000"), entry("b", 120, "#00ff00"), entry("c", 180, "#0000ff")]);
  assert.equal(result.totalMinutes, 360);
  assert.equal(result.segments.length, 3);
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.fraction, 0), 1);
  assert.equal(result.segments[0].start, 0);
  assert.equal(result.segments.at(-1)?.end, 1);
  assert.equal(result.segments[0].color, "#ff0000");
  assert.equal(result.segments[1].start, result.segments[0].end);
  assert.ok(Math.abs(result.segments[1].fraction - 1 / 3) < 1e-12);
});

test("zero minutes and empty input do not invent occupied segments", () => {
  assert.deepEqual(buildProjectDonut([]), { totalMinutes: 0, segments: [] });
  assert.deepEqual(buildProjectDonut([entry("a", 0), entry("b", 0)]), { totalMinutes: 0, segments: [] });
  const result = buildProjectDonut([entry("empty", 0), entry("only", 35)]);
  assert.equal(result.totalMinutes, 35);
  assert.deepEqual(result.segments.map(segment => [segment.path, segment.fraction]), [["only.md", 1]]);
});

test("non-finite and negative actual durations are ignored", () => {
  const result = buildProjectDonut([entry("nan", NaN), entry("inf", Infinity), entry("negative", -10), entry("valid", 60)]);
  assert.equal(result.totalMinutes, 60);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].path, "valid.md");
  assert.equal(result.segments[0].color, "var(--text-muted)");
  assert.equal(result.segments[0].fraction, 1);
});

test("the provided filtered set cannot include unselected projects", () => {
  const all = [entry("active", 30), entry("archived", 90), entry("paused", 180)];
  const filtered = all.filter(value => value.project.name === "active");
  assert.deepEqual(buildProjectDonut(filtered).segments.map(segment => segment.path), ["active.md"]);
  assert.equal(buildProjectDonut(filtered).totalMinutes, 30);
  assert.equal(all.length, 3);
  assert.equal(all[0].summary.actual, 30);
});

test("small finite values and very large totals retain finite proportions", () => {
  const small = buildProjectDonut([entry("a", .1), entry("b", .2)]);
  assert.ok(Math.abs(small.totalMinutes - .3) < 1e-12);
  assert.equal(small.segments.at(-1)?.end, 1);
  const large = buildProjectDonut([entry("a", Number.MAX_VALUE), entry("b", Number.MAX_VALUE)]);
  assert.ok(Number.isFinite(large.totalMinutes));
  assert.deepEqual(large.segments.map(segment => segment.fraction), [.5, .5]);
});

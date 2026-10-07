import assert from "node:assert/strict";
import test from "node:test";
import type { LifeEvent } from "../src/types";
import { diaryFilePath, diaryHeading } from "../src/vault/format";
import { clusterLifeEvents, lifeDateAt, lifeDateLabel, lifeDatePosition, lifeDateValue, lifeRange, parseLifeDate } from "../src/pages/life-model";

test("accepts year month and day without inventing a precise date", () => {
  assert.equal(parseLifeDate("2022")?.precision, "year");
  assert.equal(parseLifeDate("2022-07")?.precision, "month");
  assert.equal(parseLifeDate("2022-07-19")?.precision, "day");
  assert.equal(lifeDateLabel("2022"), "2022年");
  assert.equal(lifeDateLabel("2022-07"), "2022.07");
  assert.equal(lifeDateValue(2024, 2, 29, "day"), "2024-02-29");
  assert.equal(lifeDateValue(2023, 2, 29, "day"), null);
  assert.equal(parseLifeDate("2023-13"), null);
});

test("maps exact milestones to the already configured weekly diary format", () => {
  const parts = parseLifeDate("2026-10-07")!;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  assert.equal(diaryFilePath(date, "20_self/22-diary"), "20_self/22-diary/26_W41.md");
  assert.equal(diaryHeading(date), "Wednes_26-10-07");
  assert.equal(parseLifeDate("2026-10")?.precision, "month");
});

test("places chapters across their full date interval", () => {
  assert.equal(lifeDatePosition("2020", "start"), 2020);
  assert.equal(lifeDatePosition("2020", "end"), 2021);
  assert.ok(lifeDatePosition("2020", "center") > 2020);
  assert.equal(lifeDateAt(2020), "2020-01-01");
});

test("clusters overlapping labels as the line shrinks", () => {
  const events: LifeEvent[] = [
    { id: "a", title: "A", date: "2020-01-01", kind: "milestone" },
    { id: "b", title: "B", date: "2020-06-01", kind: "milestone" },
    { id: "c", title: "C", date: "2025-01-01", kind: "milestone" },
    { id: "chapter", title: "阶段", date: "2019", endDate: "2021", kind: "chapter" }
  ];
  assert.deepEqual(clusterLifeEvents(events, 48).map(group => group.map(item => item.id)), [["a", "b"], ["c"]]);
  assert.deepEqual(clusterLifeEvents(events, 340).map(group => group.map(item => item.id)), [["a"], ["b"], ["c"]]);
  assert.deepEqual(lifeRange(events, new Date(2026, 9, 7)), { first: 2000, last: 2033 });
});

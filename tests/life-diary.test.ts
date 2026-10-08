import assert from "node:assert/strict";
import test from "node:test";
import { compileFormat, diaryWeek, parseLifeDiary } from "../src/pages/life-diary";

test("matches only the configured bracket marker and captures its content", () => {
  const week = diaryWeek("20_self/22-diary/26_W37.md")!;
  const content = [
    "## Weekly-Summary",
    "## Mon_26-09-07",
    "- [ ] 早睡",
    "- 晚上：[惊喜] 新发现",
    "## Thurs_26-09-10",
    "- [event] qq 提醒不在境内",
    "- [aha-moment] 另一个发现",
    "```",
    "- [event] 代码示例",
    "```"
  ].join("\n");
  const entries = parseLifeDiary(content, week, ["[event] {内容}"]);
  assert.deepEqual(entries.map(item => [item.title, item.date, item.diaryLine]), [["qq 提醒不在境内", "2026-09-10", 5]]);
  assert.deepEqual(parseLifeDiary(content, week, ["[惊喜] {内容}"]).map(item => item.title), ["新发现"]);
  assert.equal(compileFormat("{内容}"), null);
});

test("keeps an undated weekly marker at its week position", () => {
  const week = diaryWeek("20_self/22-diary/26_W41.md")!;
  const entries = parseLifeDiary("## Weekly-Summary\n[event] 本周转折\n## Mon_26-10-05\n", week, ["[event] {内容}"]);
  assert.equal(week.date, "2026-10-05");
  assert.equal(entries[0].date, "2026-10-05");
  assert.equal(entries[0].diaryLabel, "W41");
  assert.equal(diaryWeek("20_self/22-diary/26_W54.md"), null);
});

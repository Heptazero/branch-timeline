import assert from "node:assert/strict";
import test from "node:test";
import { diaryBracketTrigger, extractDiaryBracketTerms, rankDiaryBracketTerms } from "../src/diary-bracket-model";

test("indexes diary labels but not tasks links footnotes or code", () => {
  const content = [
    "- [event-social] 见朋友 [惊喜] 好消息",
    "- [ ] 早睡\n- [x] 阅读",
    "[[study_CS_OS]] ![封面](picture.png) [Claude](https://example.com) [text][ref] [^1]",
    "`[inline]`",
    "```\n[code]\n```",
    "~~~\n[also-code]\n~~~",
    "[aha-moment] 新想法"
  ].join("\n");
  assert.deepEqual(extractDiaryBracketTerms(content), ["event-social", "惊喜", "aha-moment"]);
});

test("suggests after one opening bracket but yields to wiki links and checkboxes", () => {
  assert.deepEqual(diaryBracketTrigger("- [aha", 6), { from: 2, query: "aha" });
  assert.deepEqual(diaryBracketTrigger("[", 1), { from: 0, query: "" });
  assert.equal(diaryBracketTrigger("[[", 2), null);
  assert.equal(diaryBracketTrigger("- [ ", 4), null);
  assert.equal(diaryBracketTrigger("[event]", 7), null);
  assert.equal(diaryBracketTrigger("[foo](url)", 4), null);
});

test("ranks prefix then substring then fuzzy matches", () => {
  const terms = [
    { value: "aha-moment", count: 2, lastDate: "2026-09-01" },
    { value: "event-social", count: 1, lastDate: "2026-10-01" },
    { value: "event", count: 1, lastDate: "2026-08-01" },
    { value: "city-walk", count: 1, lastDate: "2026-10-02" }
  ];
  assert.deepEqual(rankDiaryBracketTerms(terms, "evt").map(term => term.value), ["event-social", "event"]);
  assert.deepEqual(rankDiaryBracketTerms(terms, "walk").map(term => term.value), ["city-walk"]);
  assert.equal(rankDiaryBracketTerms(terms, "")[0].value, "city-walk");
});

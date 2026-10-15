import assert from "node:assert/strict";
import test from "node:test";
import { revertTextChange } from "../src/vault/revert-text-change";

test("undoes one work line while keeping later synced day totals", () => {
  const before = "## log\n- 1015\n";
  const after = "## log\n- 1015\n\t- [10:00] 1h 实验 <!-- btl-work:a -->\n";
  const synced = "## log\n- 1015 [1h] <!-- btl:2026-10-15 -->\n\t- [10:00] 1h 实验 <!-- btl-work:a -->\n";
  assert.equal(revertTextChange(before, after, synced), "## log\n- 1015 [1h] <!-- btl:2026-10-15 -->\n");
});

test("cannot undo when the exact changed line was edited", () => {
  const before = "- [ ] 实验 ^a\n";
  const after = "- [x] 实验 ^a\n";
  assert.equal(revertTextChange(before, after, "- [x] 新实验 ^a\n"), null);
});

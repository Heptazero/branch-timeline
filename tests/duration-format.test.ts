import assert from "node:assert/strict";
import test from "node:test";
import { durationLabel, gapDurationLabel, compactDuration, readableDuration, shortDurationLabel } from "../src/timeline/duration-format";

test("fractional-minute labels hide binary decimals without changing saved duration", () => {
  const minutes = 27.9806666666707;
  assert.equal(durationLabel(minutes), "28 分钟");
  assert.equal(shortDurationLabel(minutes), "28m");
  assert.equal(gapDurationLabel(84.10213333333337), "未记录 1h24m");
  assert.equal(gapDurationLabel(32.30108333333317), "未记录 32m");
  assert.equal(compactDuration(20.99525000000055), "21m");
  assert.equal(readableDuration(59.9999), "1小时");
  assert.equal(durationLabel(0.25), "15 秒");
  assert.equal(compactDuration(0.25), "15s");
  assert.equal(minutes, 27.9806666666707);
});

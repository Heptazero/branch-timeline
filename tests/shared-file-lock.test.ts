import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { withSharedFileLock } from "../src/vault/shared-file-lock";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "btl-shared-lock-"));
  const file = join(root, "状态.json"); await writeFile(file, "0");
  return { root, file };
}
test("shared file lock serializes independent writers and releases after an error", async () => {
  const { root, file } = await fixture();
  try {
    const update = () => withSharedFileLock(file, async () => {
      const count = Number(await readFile(file, "utf8"));
      await new Promise(resolve => setTimeout(resolve, 30)); await writeFile(file, String(count + 1));
    });
    await Promise.all([update(), update(), update()]);
    assert.equal(await readFile(file, "utf8"), "3");
    await assert.rejects(withSharedFileLock(file, async () => { throw new Error("failed action"); }), /failed action/);
    await update(); assert.equal(await readFile(file, "utf8"), "4");
  } finally { await rm(root, { recursive: true }); }
});
test("a crashed process lock is reclaimed without changing the data file", async () => {
  const { root, file } = await fixture();
  const key = createHash("sha256").update((await realpath(file)).normalize("NFC")).digest("hex");
  const folder = `/tmp/branch-timeline-locks-${process.getuid!()}/${key}`;
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "owner"), JSON.stringify({ pid: 2147483647, token: "dead" }));
    await withSharedFileLock(file, async () => assert.equal(await readFile(file, "utf8"), "0"));
  } finally { await rm(root, { recursive: true }); await rm(folder, { recursive: true, force: true }); }
});
test("Swift and Node writers share the same real lock", { skip: !process.env.BTL_CORE_CHECKS_BIN }, async () => {
  const { root, file } = await fixture();
  const child = spawn(process.env.BTL_CORE_CHECKS_BIN!, ["--hold-lock", file], { stdio: ["ignore", "pipe", "pipe"] });
  const completion = once(child, "exit");
  try {
    const [chunk] = await once(child.stdout, "data"); assert.match(String(chunk), /LOCKED/);
    const expected = createHash("sha256").update((await realpath(file)).normalize("NFC")).digest("hex");
    assert.ok(String(chunk).includes(expected), `${String(chunk)} node=${await realpath(file)} hash=${expected}`);
    await withSharedFileLock(file, async () => assert.equal(await readFile(file, "utf8"), "native-released"));
    assert.equal((await completion)[0], 0);
  } finally { if (child.exitCode === null) child.kill(); await rm(root, { recursive: true }); }
});

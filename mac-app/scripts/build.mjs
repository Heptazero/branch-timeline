import { spawnSync } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await import("../../scripts/build-native-bridge.mjs");
const scratch = process.env.BTL_SWIFT_SCRATCH || join(root, ".build");
const flags = ["--package-path", root, "--scratch-path", scratch,
  "--cache-path", join(scratch, "cache"), "--config-path", join(scratch, "configuration"),
  "--security-path", join(scratch, "security"), "-Xswiftc", "-module-cache-path", "-Xswiftc", join(scratch, "modules")];
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8" });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed: ${result.status}`);
  return result.stdout?.trim();
}
run("swift", ["build", ...flags, "-c", "release", "--product", "BranchTimelineMac"]);
const bin = run("swift", ["build", ...flags, "-c", "release", "--show-bin-path"], true);
const dist = join(root, "dist");
const contents = join(dist, "Branch Timeline.app", "Contents");
await mkdir(join(contents, "MacOS"), { recursive: true });
await mkdir(join(contents, "Resources"), { recursive: true });
await copyFile(join(bin, "BranchTimelineMac"), join(contents, "MacOS", "BranchTimelineMac"));
await copyFile(join(root, "Info.plist"), join(contents, "Info.plist"));
const { cp } = await import("node:fs/promises");
await cp(join(bin, "BranchTimelineMac_TimelineCore.bundle"), join(contents, "Resources", "BranchTimelineMac_TimelineCore.bundle"), { recursive: true });
const iconset = join(dist, "AppIcon.iconset");
run("swift", ["-module-cache-path", join(scratch, "modules"), join(root, "scripts", "Icon.swift"), iconset]);
run("iconutil", ["-c", "icns", iconset, "-o", join(contents, "Resources", "AppIcon.icns")]);
run("codesign", ["--force", "--sign", "-", "--timestamp=none", join(dist, "Branch Timeline.app")]);
run("codesign", ["--verify", "--strict", join(dist, "Branch Timeline.app")]);
run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", join(dist, "Branch Timeline.app"), join(dist, "BranchTimelineMac-0.3.8.zip")]);
console.log(join(dist, "Branch Timeline.app"));

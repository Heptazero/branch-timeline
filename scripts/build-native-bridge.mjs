import esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const folder = root + "mac-app/Sources/TimelineCore/Resources/";
await mkdir(folder, { recursive: true });
await esbuild.build({ stdin: { contents: 'export * from "./src/desktop/shared-session"; export * from "./src/desktop/dashboard"; export * from "./src/desktop/timeline-edit"; export * from "./src/desktop/rhythm-data"; export * from "./src/desktop/plan-timer";', resolveDir: root }, bundle: true, platform: "neutral", target: "es2020",
  format: "iife", globalName: "BTLShared", minify: true, outfile: folder + "shared-session.js" });

await import("./build-feature-web.mjs");

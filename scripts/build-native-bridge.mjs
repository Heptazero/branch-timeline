import esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const folder = root + "mac-app/Sources/TimelineCore/Resources/";
await mkdir(folder, { recursive: true });
await esbuild.build({ entryPoints: [root + "src/desktop/shared-session.ts"], bundle: true, platform: "neutral", target: "es2020",
  format: "iife", globalName: "BTLShared", minify: true, outfile: folder + "shared-session.js" });

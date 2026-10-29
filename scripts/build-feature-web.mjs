import esbuild from "esbuild";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const folder = root + "mac-app/Sources/TimelineCore/Resources/";
await esbuild.build({ entryPoints: [root + "src/desktop/features/entry.ts"], bundle: true, platform: "browser", target: "es2020", minify: true,
  alias: { obsidian: root + "src/desktop/features/ui-shim.ts" }, external: ["node:*"], define: { process: "undefined" }, outfile: folder + "features.js" });
await esbuild.build({ entryPoints: [root + "src/desktop/features/feature.css"], bundle: true, minify: true, outfile: folder + "features.css" });
await writeFile(folder + "features.html", `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none';"><link rel="stylesheet" href="features.css"></head><body><main id="app"><div class="feature-loading"><span></span></div></main><div id="error" hidden role="alert"></div><script src="features.js"></script></body></html>`);

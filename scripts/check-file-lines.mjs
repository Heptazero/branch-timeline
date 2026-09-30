import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const MAX_LINES = 500;
const SOURCE_EXTENSIONS = new Set([".ts", ".mjs", ".css"]);
const roots = ["src", "tests", "scripts"];
const files = ["styles.css", "esbuild.config.mjs"];

for (const root of roots) await collect(root);

const oversized = [];
for (const file of [...new Set(files)].sort()) {
  const source = await readFile(file, "utf8");
  const lines = source === "" ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
  if (lines > MAX_LINES) oversized.push(`${file}: ${lines}`);
}

if (oversized.length) {
  console.error(`源码文件不得超过 ${MAX_LINES} 行：\n${oversized.join("\n")}`);
  process.exit(1);
}

console.log(`源码文件行数检查通过（上限 ${MAX_LINES} 行）。`);

async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await collect(child);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(child);
  }
}

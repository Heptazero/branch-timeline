import esbuild from "esbuild";
import process from "process";

const mode = process.argv[2];
const external = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr"
];

if (mode === "test") {
  await esbuild.build({
    entryPoints: ["tests/format.test.ts", "tests/project-time-sync.test.ts", "tests/project-tasks.test.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outdir: ".test-dist",
    outExtension: { ".js": ".cjs" }
  });
  process.exit(0);
}

const prod = mode === "production";
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external,
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js"
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}

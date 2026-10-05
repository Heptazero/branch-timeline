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
const css = await esbuild.context({
  entryPoints: ["src/styles/index.css"],
  bundle: true,
  minify: true,
  logLevel: "info",
  outfile: "styles.css"
});

if (prod) {
  await Promise.all([ctx.rebuild(), css.rebuild()]);
  await Promise.all([ctx.dispose(), css.dispose()]);
} else {
  await Promise.all([ctx.watch(), css.watch()]);
}

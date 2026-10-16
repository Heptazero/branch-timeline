import assert from "node:assert/strict";
import test from "node:test";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { BranchTimelineSettings } from "../src/types";
import type { UndoAction } from "../src/undo-manager";
import { VaultRepository } from "../src/vault/repository";

function fixture() {
  const file = new TFile();
  file.path = "project.md";
  let content = "## 任务\n\n## log\n";
  const app = { vault: {
    getAbstractFileByPath: (path: string) => path === file.path ? file : null,
    read: async () => content,
    process: async (_file: TFile, transform: (source: string) => string) => { content = transform(content); }
  } } as unknown as App;
  const repo = new VaultRepository(app, {} as BranchTimelineSettings);
  return { repo, get content() { return content; }, set content(next: string) { content = next; } };
}

test("project edit rolls back when the paired timeline update fails", async () => {
  const subject = fixture();
  const original = subject.content;
  let undoCount = 0;
  subject.repo.setUndoRecorder(() => { undoCount += 1; });
  await assert.rejects(subject.repo.addProjectTask("project.md", "实验", "task-a", async () => {
    throw new Error("timeline write failed");
  }), /timeline write failed/);
  assert.equal(subject.content, original);
  assert.equal(undoCount, 0);
});

test("project undo removes only its task and preserves intervening manual edits", async () => {
  const subject = fixture();
  let undo: UndoAction | undefined;
  subject.repo.setUndoRecorder(action => { undo = action; });
  await subject.repo.addProjectTask("project.md", "实验", "task-a");
  subject.content += "手工补充\n";
  await undo?.();
  assert.match(subject.content, /手工补充/);
  assert.doesNotMatch(subject.content, /实验/);
});

test("project undo refuses to overwrite a manually edited task line", async () => {
  const subject = fixture();
  let undo: UndoAction | undefined;
  subject.repo.setUndoRecorder(action => { undo = action; });
  await subject.repo.addProjectTask("project.md", "实验", "task-a");
  subject.content = subject.content.replace("实验", "新实验");
  await assert.rejects(async () => { await undo?.(); }, /相关内容已在别处修改/);
  assert.match(subject.content, /新实验/);
});

test("comment conversion previews, applies and undoes only known project markers", async () => {
  const file = new TFile();
  file.path = "project.md";
  let content = "## log\n- 1016 [1h] <!-- btl:2026-10-16 -->\n备注 <!-- unrelated -->";
  const app = { vault: {
    getAbstractFileByPath: () => file,
    read: async () => content,
    process: async (_file: TFile, transform: (source: string) => string) => { content = transform(content); }
  } } as unknown as App;
  const repo = new VaultRepository(app, {} as BranchTimelineSettings);
  repo.listProjects = () => [{ path: file.path, name: "project", type: "project", status: "active" }];
  let undo: UndoAction | undefined;
  repo.setUndoRecorder(action => { undo = action; });
  const plan = await repo.previewPluginCommentConversion("obsidian");
  assert.equal(plan.markerCount, 1);
  await repo.applyPluginCommentConversion(plan);
  assert.match(content, /%%btl:2026-10-16%%/);
  assert.match(content, /<!-- unrelated -->/);
  await undo?.();
  assert.equal(content, plan.changes[0].before);
});

test("comment conversion stops and rolls back if a project changed after preview", async () => {
  const files = [new TFile(), new TFile()];
  files[0].path = "a.md";
  files[1].path = "b.md";
  const content = new Map(files.map(file => [file.path, "## log\n- 1016 [1h] <!-- btl:2026-10-16 -->"]));
  const app = { vault: {
    getAbstractFileByPath: (path: string) => files.find(file => file.path === path),
    read: async (file: TFile) => content.get(file.path)!,
    process: async (file: TFile, transform: (source: string) => string) => {
      content.set(file.path, transform(content.get(file.path)!));
    }
  } } as unknown as App;
  const repo = new VaultRepository(app, {} as BranchTimelineSettings);
  repo.listProjects = () => files.map(file => ({ path: file.path, name: file.basename, type: "project", status: "active" }));
  const plan = await repo.previewPluginCommentConversion("obsidian");
  content.set("b.md", `${content.get("b.md")}\n手写内容`);
  await assert.rejects(repo.applyPluginCommentConversion(plan), /已修改/);
  assert.equal(content.get("a.md"), plan.changes[0].before);
  assert.match(content.get("b.md")!, /手写内容/);
});

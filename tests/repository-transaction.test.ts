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

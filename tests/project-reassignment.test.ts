import assert from "node:assert/strict";
import test from "node:test";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import type BranchTimelinePlugin from "../src/main";
import type { BranchTimelineSettings, BranchTimelineState, TimelineDayState } from "../src/types";
import { reassignItemProject } from "../src/timeline/reassign-item-project";
import { recordBackfilledGap } from "../src/timeline/backfill-gap";
import { prepareTimelineTodoProject } from "../src/timeline-todo-project";
import { TimerService } from "../src/timeline/timer-service";
import { appendProjectLog, projectWorkLogEntry } from "../src/vault/format";
import { VaultRepository } from "../src/vault/repository";

function fixture() {
  const files = new Map<string, { file: TFile; text: string }>();
  for (const path of ["old.md", "new.md"]) { const file = new TFile(); file.path = path; files.set(path, { file, text: "## log\n" }); }
  const app = { vault: {
    getAbstractFileByPath: (path: string) => files.get(path)?.file || null,
    read: async (file: TFile) => files.get(file.path)!.text,
    process: async (file: TFile, transform: (content: string) => string) => {
      const entry = files.get(file.path)!;
      entry.text = transform(entry.text);
    }
  } } as unknown as App;
  const settings = { itemMetadataRequirement: "project", pluginCommentStyle: "html" } as BranchTimelineSettings;
  const repository = new VaultRepository(app, settings);
  const state = { days: { "2026-10-17": { wake: 420, items: [{
    id: "fact-one", title: "阅读", kind: "fact", startMin: 600, endMin: 660,
    projectPath: "old.md", projectLogId: "fact-one", projectLogPath: "old.md"
  }] } } } as unknown as BranchTimelineState;
  const store = {
    load: async () => state,
    update: async (mutate: (value: BranchTimelineState) => void) => { mutate(state); }
  };
  const plugin = { settings, repository, store } as unknown as BranchTimelinePlugin;
  return { files, repository, state, plugin, settings };
}

test("moving a fact moves its marked work line and keeps manually edited details", async () => {
  const subject = fixture();
  subject.files.get("old.md")!.text = appendProjectLog("## log\n", "2026-10-17", "11:00", 1, "手工补充的详情", "fact-one");
  await reassignItemProject(subject.plugin, "2026-10-17", "fact-one", "new.md");
  assert.equal(projectWorkLogEntry(subject.files.get("old.md")!.text, "fact-one"), null);
  assert.match(subject.files.get("new.md")!.text, /手工补充的详情/);
  assert.equal(projectWorkLogEntry(subject.files.get("new.md")!.text, "fact-one")?.hours, 1);
  const item = subject.state.days["2026-10-17"].items[0];
  assert.equal(item.projectPath, "new.md");
  assert.equal(item.projectLogPath, "new.md");
  await reassignItemProject(subject.plugin, "2026-10-17", "fact-one", "new.md");
  assert.equal(subject.files.get("new.md")!.text.match(/btl-work:fact-one/g)?.length, 1);
});

test("assigning an unlogged fact creates its destination work line", async () => {
  const subject = fixture();
  const item = subject.state.days["2026-10-17"].items[0];
  item.projectPath = undefined;
  item.projectLogId = undefined;
  item.projectLogPath = undefined;
  await reassignItemProject(subject.plugin, "2026-10-17", "fact-one", "new.md");
  assert.equal(projectWorkLogEntry(subject.files.get("new.md")!.text, "fact-one")?.hours, 1);
  assert.equal(item.projectLogPath, "new.md");
});

test("project log navigation resolves the exact marked work line", async () => {
  const subject = fixture();
  const first = appendProjectLog("## log\n", "2026-10-17", "10:00", 0.5, "其他", "fact-other");
  subject.files.get("new.md")!.text = appendProjectLog(first, "2026-10-17", "11:00", 1, "阅读", "fact-one");
  const entry = projectWorkLogEntry(subject.files.get("new.md")!.text, "fact-one");
  assert.equal(await subject.repository.projectLogLine("new.md", "fact-one"), entry?.line);
});

test("failed destination-to-state move restores both Markdown files", async () => {
  const subject = fixture();
  const original = appendProjectLog("## log\n", "2026-10-17", "11:00", 1, "阅读", "fact-one");
  subject.files.get("old.md")!.text = original;
  await assert.rejects(subject.repository.relocateProjectWorkLog(
    "old.md", "new.md", "2026-10-17", 660, 60, "阅读", "fact-one", async () => { throw new Error("state failed"); }
  ), /state failed/);
  assert.equal(subject.files.get("old.md")!.text, original);
  assert.equal(subject.files.get("new.md")!.text, "## log\n");
});

test("reassignment undo restores the source even after unrelated day totals change", async () => {
  const subject = fixture();
  subject.files.get("old.md")!.text = appendProjectLog("## log\n", "2026-10-17", "11:00", 1, "阅读", "fact-one");
  let undo: (() => Promise<void>) | undefined;
  subject.repository.setUndoRecorder(action => { undo = async () => { await action(); }; });
  await subject.repository.relocateProjectWorkLog("old.md", "new.md", "2026-10-17", 660, 60, "阅读", "fact-one", async () => {});
  subject.files.get("new.md")!.text += "\n手工补充\n";
  subject.files.get("old.md")!.text += "\n其他记录\n";
  await undo?.();
  assert.equal(projectWorkLogEntry(subject.files.get("new.md")!.text, "fact-one"), null);
  assert.ok(projectWorkLogEntry(subject.files.get("old.md")!.text, "fact-one"));
  assert.match(subject.files.get("new.md")!.text, /手工补充/);
  assert.match(subject.files.get("old.md")!.text, /其他记录/);
});

test("required project rejects unassigned item drafts and reassignment", async () => {
  const subject = fixture();
  const draft = { title: "阅读", note: "", projectPath: null, linkTask: false, task: null };
  await assert.rejects(prepareTimelineTodoProject(subject.plugin, draft, new Date(2026, 9, 17), 600, "todo", async () => {}), /选择项目/);
  await assert.rejects(recordBackfilledGap(subject.plugin, new Date(2026, 9, 17), 600, 660, draft, "fact"), /选择项目/);
  await assert.rejects(reassignItemProject(subject.plugin, "2026-10-17", "fact-one", null), /关联项目/);
});

test("resetting a running start discards only the current elapsed segment", () => {
  const service = new TimerService();
  const day = { wake: 420, items: [
    { id: "todo", title: "写作", kind: "todo" as const, startedMin: 600 },
    { id: "fact", title: "实验", kind: "fact" as const, startMin: 610, endMin: 610, factTiming: true },
    { id: "done", title: "旧记录", kind: "fact" as const, startMin: 500, endMin: 550, projectLogId: "done" }
  ] } as TimelineDayState;
  assert.equal(service.resetStart(day, "todo", 640), true);
  assert.equal(service.resetStart(day, "fact", 640), true);
  assert.equal(service.resetStart(day, "done", 640), false);
  assert.equal(day.items[0].startedMin, 640);
  assert.equal(day.items[1].startMin, 640);
  assert.equal(day.items[1].endMin, 640);
  assert.equal(day.items[2].startMin, 500);
});

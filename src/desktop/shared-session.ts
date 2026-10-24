import { desktopEntries, parseDesktopSession } from "./session-model";
import { desktopWorkLog } from "./session-log";
import { DEFAULT_RHYTHM } from "../rhythm";
import type { BranchTimelineSettings, TimelineDayState, TimelineItem } from "../types";

type RecordValue = Record<string, unknown>;
interface SharedDocument extends RecordValue {
  version: 1;
  days: Record<string, TimelineDayState>;
  macTimer?: { version: 1; active?: { id: string } | null };
  desktopReceipts?: Record<string, { status: "imported" | "too-short"; seconds?: number }>;
}
function record(value: unknown): value is RecordValue { return !!value && typeof value === "object" && !Array.isArray(value); }

export function readSharedState(text: string): SharedDocument {
  const state = JSON.parse(text);
  if (!record(state) || state.version !== 1 || !record(state.days)) throw new Error("时间线数据格式无效，未覆盖原文件");
  if (state.macTimer != null && (!record(state.macTimer) || state.macTimer.version !== 1)) throw new Error("Mac 计时状态格式无效");
  if (state.desktopReceipts != null && !record(state.desktopReceipts)) throw new Error("保存回执格式无效");
  if (record(state.desktopReceipts) && Object.values(state.desktopReceipts).some(value => !record(value) || !["imported", "too-short"].includes(String(value.status)))) throw new Error("保存回执内容无效");
  return state as unknown as SharedDocument;
}

/** Compiled for JavaScriptCore: the App uses the same fact splitting and Markdown formatter. */
export function finishSharedSession(stateText: string, sessionText: string, settingsText: string, projectText: string, alreadyImported = false): string {
  const state = readSharedState(stateText), session = parseDesktopSession(sessionText);
  const settings: Partial<BranchTimelineSettings> = JSON.parse(settingsText);
  const receipts = state.desktopReceipts ||= {};
  const entries = desktopEntries(session);
  if (receipts[session.id] || alreadyImported) {
    receipts[session.id] ||= { status: entries.length ? "imported" : "too-short" };
    if (state.macTimer?.active?.id === session.id) state.macTimer.active = null;
    return JSON.stringify({ state, project: projectText, status: receipts[session.id].status });
  }
  const known = new Set<string>();
  for (const day of Object.values(state.days)) {
    if (!record(day) || !Array.isArray(day.items)) throw new Error("已有日期的事项格式无效，未覆盖");
    day.items.forEach((item: TimelineItem) => known.add(item.id));
  }
  let project = projectText;
  for (const entry of entries) {
    if (known.has(entry.item.id)) continue;
    const minutes = entry.item.endMin! - entry.item.startMin!;
    const time = `${String(Math.floor(entry.item.endMin! / 60) % 24).padStart(2, "0")}:${String(entry.item.endMin! % 60).padStart(2, "0")}`;
    project = desktopWorkLog(project, entry.date, time, minutes, [session.title, session.note].filter(Boolean).join(" — "), entry.item.id, settings.pluginCommentStyle === "obsidian" ? "obsidian" : "html");
    const day = state.days[entry.date] ||= {
      ...DEFAULT_RHYTHM, ...settings.rhythm, wakeReal: false, napStartReal: false, napEndReal: false,
      sleepPrepReal: false, sleepReal: false, branches: [], items: []
    };
    day.items.push(entry.item);
    (day.distractions ||= []).push(...entry.distractions);
    (day.goodStates ||= []).push(...entry.goodStates);
    known.add(entry.item.id);
  }
  const status = entries.length ? "imported" : "too-short";
  receipts[session.id] = { status, seconds: session.segments.reduce((sum, part) => sum + (Date.parse(part.end) - Date.parse(part.start)) / 1000, 0) };
  if (state.macTimer?.active?.id === session.id) state.macTimer.active = null;
  return JSON.stringify({ state, project, status });
}

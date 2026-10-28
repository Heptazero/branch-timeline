import type { BranchTimelineSettings, BranchTimelineState, TimelineItem } from "../types";
import { DEFAULT_RHYTHM } from "../rhythm";
import { readSharedState } from "./shared-session";
import { appendProjectLog, dateKey } from "../vault/format";
import { projectWorkLogEntry, removeProjectWorkLog, upsertProjectDayTotal } from "../vault/format";
import { formatTime } from "../timeline/model";
import { completedProjectTotals, completedProjectTaskTotals } from "../vault/project-time-sync";
import { upsertProjectTaskTotals } from "../vault/project-tasks";

interface EditRequest {
  date: string; id: string; start: number; end: number;
  kind?: "todo" | "fact"; move?: boolean; expected?: string; title?: string; note?: string; projectPath?: string; tagId?: string;
}
const canonical = (value: unknown): string => JSON.stringify(value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, JSON.parse(canonical(val))])) : value);

/** Single-day completed facts only. The live session and arbitrary Markdown never become editable facts. */
export function nativeEditBlock(text: string, requestText: string, settingsText: string, projectText: string): string {
  const state = readSharedState(text), request = JSON.parse(requestText) as EditRequest;
  const settings = JSON.parse(settingsText) as Partial<BranchTimelineSettings>;
  const { date, id, start, end } = request;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || dateKey(parsed) !== date || typeof id !== "string" || !/^[\w-]{1,160}$/.test(id)
    || !Number.isInteger(start) || !Number.isInteger(end) || start < 120 || end > 1560 || end <= start) throw new Error("时间范围无效（一天从 02:00 到次日 02:00）");
  const existing = state.days[date]?.items.find(item => item.id === id);
  let item: TimelineItem;
  if (request.expected != null) {
    if (!existing || canonical(existing) !== canonical(JSON.parse(request.expected))) throw new Error("记录已变化，请刷新后重试");
    if ((existing.kind !== "fact" && !(existing.kind === "todo" && existing.startedMin == null)) || existing.factTiming || (existing.kind === "todo" && existing.startedMin != null) || id.startsWith(`desktop-${state.macTimer?.active?.id}-`)) throw new Error("请先结束计时，再调整时间块");
    item = existing;
  } else {
    if (Object.values(state.days).some(day => day.items.some(item => item.id === id))) throw new Error("记录编号重复");
    if (typeof request.title !== "string" || !request.title.trim() || request.title.length > 400
      || typeof request.note !== "string" || request.note.length > 20000) throw new Error("请填写标题，备注最多 20000 字");
    const path = request.projectPath || "", requirement = settings.itemMetadataRequirement;
    if (request.kind != null && !["todo", "fact"].includes(request.kind)) throw new Error("时间块类型无效");
    if (typeof path !== "string" || (path && (!path.endsWith(".md") || path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === ".." || part === ".")))) throw new Error("项目路径无效");
    if ((requirement === "project" || requirement === "both") && !path) throw new Error("请先选择项目");
    const tag = settings.tags?.find(tag => tag.id === request.tagId);
    if ((requirement === "tag" || requirement === "both") && !tag) throw new Error("请先选择标签");
    item = { id, kind: request.kind === "todo" ? "todo" : "fact", title: request.title.trim(), note: request.note.trim() || undefined,
      projectPath: path || undefined, tagId: tag?.id, tag: tag?.category };
    if (path && item.kind === "fact") { item.projectLogId = id; item.projectLogPath = path; }
    const day = state.days[date] ||= { ...DEFAULT_RHYTHM, ...settings.rhythm, branches: [], items: [] };
    day.items.push(item);
  }
  const plan = item.kind === "todo";
  if (request.move && existing) {
    const oldStart = plan ? existing.plannedMin ?? start : existing.startMin ?? start;
    const oldEnd = plan ? existing.plannedEndMin ?? oldStart + 30 : existing.endMin ?? oldStart;
    if (end - start !== oldEnd - oldStart) throw new Error("整体移动须保留原时长");
    const day = state.days[date], delta = start - oldStart;
    for (const events of [day.distractions, day.goodStates]) for (const event of events || []) {
      if (event.itemId === id) event.minute += delta;
    }
  }
  let project = projectText;
  if (!plan && item.projectLogId) {
    if (existing) {
      const old = projectWorkLogEntry(project, item.projectLogId);
      if (!old) throw new Error("找不到对应的项目日志，请先检查文件");
      // Preserve handwritten details and the marker style when only resizing a block.
      project = appendProjectLog(removeProjectWorkLog(project, item.projectLogId), date, formatTime(end), (end - start) / 60, old.note, item.projectLogId, old.style);
    } else {
      project = appendProjectLog(project, date, formatTime(end), (end - start) / 60,
        [item.title, item.note].filter(Boolean).join(" — ").replace(/\s*[\r\n]+\s*/g, " / "), item.projectLogId, settings.pluginCommentStyle);
      if (!projectWorkLogEntry(project, item.projectLogId)) throw new Error("项目日志内容无法保存，请检查标题和备注");
    }
  }
  if (plan) { item.plannedMin = start; item.plannedEndMin = end; }
  else { item.startMin = start; item.endMin = end; }
  if (!plan && item.projectLogId && item.projectPath && item.projectPath === (item.projectLogPath || item.projectPath)) {
    const full = state as unknown as BranchTimelineState;
    project = upsertProjectDayTotal(project, date, completedProjectTotals(full, date).totals.get(item.projectPath) || 0, settings.pluginCommentStyle);
    project = upsertProjectTaskTotals(project, completedProjectTaskTotals(full, item.projectPath), settings.pluginCommentStyle);
  }
  return JSON.stringify({ state, project });
}

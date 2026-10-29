import { dateKey, logicalToday } from "../vault/format";
import { readSharedState } from "./shared-session";
import { planSource, unchangedPlan } from "./plan-source";
export function nativePreparePlan(text: string, date: string, id: string, revision: string, nowText = new Date().toISOString()): string {
  const state = readSharedState(text);
  if (state.macTimer?.active) throw new Error("请先结束或取消当前计时");
  const now = new Date(nowText); if (!Number.isFinite(now.getTime())) throw new Error("开始时间无效");
  if (state.days[dateKey(logicalToday(now))]?.items?.some(item => item.factTiming || (item.kind === "todo" && item.startedMin != null))) throw new Error("分支时间线上还有计时，请先结束或取消");
  const item = state.days[date]?.items?.find(item => item.id === id);
  if (!item || item.kind !== "todo" || item.startedMin != null || !unchangedPlan(item, revision)) throw new Error("计划已变化，请刷新后重试");
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 400 || (item.note != null && (typeof item.note !== "string" || item.note.length > 20_000))) throw new Error("计划标题或备注过长，请先编辑后重试");
  if (!item.projectPath) throw new Error("请先为计划关联项目");
  const source = { date, id, revision }; planSource(source, item.projectPath);
  const minutes = item.plannedEndMin != null && item.plannedMin != null ? Math.max(0, Math.min(1440, Math.round(item.plannedEndMin - item.plannedMin))) : 0;
  return JSON.stringify({ title: item.title, projectPath: item.projectPath, note: item.note || "", targetMinutes: minutes, source });
}

import { normalizeSettings } from "../settings-state";
import { normalizeTimelineDay } from "../rhythm";
import { dateKey } from "../vault/format";
import { effectiveEnergyPhases, materializeEnergyPhases, energyPhaseBounds } from "../timeline/energy-phases";
import { readSharedState } from "./shared-session";
import { itemStart, itemEnd } from "../timeline/model";
import type { TimelineMentalState, TimelineDistraction, TimelineGoodState } from "../types";
interface ContextEdit {
  date: string; action: "save" | "delete"; kind: "mental" | "distraction" | "good" | "energy"; id: string;
  minute?: number; score?: number; label?: string; level?: string; color?: string; expected?: string;
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
/** Edits only one explicit observation or this day's materialized energy schedule. */
export function nativeEditContext(text: string, settingsText: string, requestText: string): string {
  const state = readSharedState(text), settings = normalizeSettings(JSON.parse(settingsText)), request = JSON.parse(requestText) as ContextEdit;
  const parsed = new Date(request.date + "T12:00:00");
  if (!Number.isFinite(parsed.getTime()) || dateKey(parsed) !== request.date || !/^\d{4}-\d{2}-\d{2}$/.test(request.date)
    || !["save", "delete"].includes(request.action) || !["mental", "good", "distraction", "energy"].includes(request.kind)
    || typeof request.id !== "string" || !/^[\w-]{1,160}$/.test(request.id)) throw new Error("记录格式无效");
  if (request.action === "save" && (!Number.isFinite(request.minute) || request.minute! < 120 || request.minute! > 1560)) throw new Error("时间须在02:00到次日02:00之间");
  if (request.label != null && (typeof request.label !== "string" || request.label.length > 24)) throw new Error("名称最多24字");
  if (request.kind === "energy") {
    const phases = effectiveEnergyPhases(state.days, request.date);
    if (request.expected == null || canonical(phases) !== canonical(JSON.parse(request.expected))) throw new Error("精力区间已变化，请刷新后重试");
    const existing = phases.find(phase => phase.id === request.id);
    if (request.action === "delete" && !existing) throw new Error("精力区间已删除");
    if (request.action === "save") {
      if (!request.label?.trim() || !/^#[0-9a-f]{6}$/i.test(request.color || "")) throw new Error("请填写名称并选择颜色");
      if (phases.some(phase => phase.id !== request.id && Math.abs(phase.at - request.minute!) < 5)) throw new Error("相邻精力分界至少相隔5分钟");
      if (existing) {
        const bounds = energyPhaseBounds(phases, request.id, 120, 1560);
        if (request.minute! < bounds[0] || request.minute! > bounds[1]) throw new Error("分界不能越过相邻区间");
      }
    }
    const day = state.days[request.date] ||= normalizeTimelineDay(settings.rhythm);
    const values = materializeEnergyPhases(state.days, request.date, day);
    if (request.action === "delete") day.energyPhases = values.filter(phase => phase.id !== request.id);
    else {
      const value = { id: request.id, at: request.minute!, name: request.label!.trim(), color: request.color!, side: existing?.side || 1 as const };
      day.energyPhases = [...values.filter(phase => phase.id !== request.id), value].sort((a, b) => a.at - b.at);
    }
  } else {
    const key = request.kind === "mental" ? "mentalStates" : request.kind === "good" ? "goodStates" : "distractions";
    const existing = state.days[request.date]?.[key]?.find(event => event.id === request.id);
    if (request.expected != null) {
      if (!existing || canonical(existing) !== canonical(JSON.parse(request.expected))) throw new Error("状态记录已变化，请刷新后重试");
    } else if (existing || request.action === "delete") throw new Error("记录已变化，请刷新后重试");
    const active = state.macTimer?.active;
    if (existing && "itemId" in existing && existing.itemId?.startsWith(`desktop-${active?.id}-`)) throw new Error("请先结束计时再编辑这个标记");
    if (request.action === "save") {
      if (request.kind === "mental" && (!Number.isFinite(request.score) || request.score! < 0 || request.score! > 100)) throw new Error("脑力须在0–100之间");
      if (request.kind === "distraction" && !["light", "medium", "heavy"].includes(request.level || "")) throw new Error("请选择分神程度");
      if (existing && "itemId" in existing && existing.itemId) {
        const day = state.days[request.date], item = day.items.find(item => item.id === existing.itemId);
        if (item && (request.minute! < itemStart(item, day.wake) || request.minute! > itemEnd(item, day.wake))) throw new Error("标记时间须在对应时间块内");
      }
    }
    const day = state.days[request.date] ||= normalizeTimelineDay(settings.rhythm);
    const events: Array<TimelineMentalState | TimelineGoodState | TimelineDistraction> = day[key] || [];
    const next = events.filter(event => event.id !== request.id);
    if (request.action === "save") next.push({ ...existing, id: request.id, minute: request.minute!,
      ...(request.kind === "mental" ? { score: Math.round(request.score!), label: request.label?.trim() || undefined } : {}),
      ...(request.kind === "distraction" ? { level: request.level as TimelineDistraction["level"] } : {}) });
    (day as unknown as Record<string, unknown>)[key] = next;
  }
  return JSON.stringify(state);
}

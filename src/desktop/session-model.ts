import { planSource, type PlanSource } from "./plan-source";
import { dateKey } from "../vault/format";
import type { DistractionLevel, TimelineDistraction, TimelineGoodState, TimelineItem } from "../types";

export interface DesktopSession {
  version: 1; id: string; projectPath: string; title: string; note: string;
  startedAt: string; endedAt: string; sourcePlan?: PlanSource; minimumRecordSeconds?: number;
  segments: Array<{ start: string; end: string }>;
  markers: Array<{ id: string; at: string; kind: "good" | "distraction"; level: DistractionLevel }>;
}
export interface DesktopEntry {
  date: string; item: TimelineItem; distractions: TimelineDistraction[]; goodStates: TimelineGoodState[];
}
export const DESKTOP_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
function dayMinute(date: Date, logical: Date, precise: boolean): number {
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000;
  return (precise ? minute : Math.round(minute)) + (dateKey(date) !== dateKey(logical) ? 1440 : 0);
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function parseDesktopSession(text: string): DesktopSession {
  if (text.length > 2_000_000) throw new Error("Mac 记录过大");
  const value: unknown = JSON.parse(text);
  if (!object(value) || value.version !== 1 || typeof value.id !== "string" || !DESKTOP_ID.test(value.id)
    || typeof value.projectPath !== "string" || !value.projectPath.endsWith(".md") || value.projectPath.startsWith("/")
    || value.projectPath.includes("\\") || value.projectPath.split("/").some(part => !part || part === ".." || part === ".")
    || typeof value.title !== "string" || !value.title.trim() || value.title.length > 400
    || typeof value.note !== "string" || value.note.length > 20_000 || !timestamp(value.startedAt) || !timestamp(value.endedAt)
    || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > 1000
    || !Array.isArray(value.markers) || value.markers.length > 10_000) throw new Error("Mac 记录格式无效");
  const start = Date.parse(value.startedAt), end = Date.parse(value.endedAt);
  if (end < start || end - start > 7 * 86400000) throw new Error("Mac 记录时间范围无效");
  let previous = start;
  for (const segment of value.segments) {
    if (!object(segment) || !timestamp(segment.start) || !timestamp(segment.end)) throw new Error("计时间段格式无效");
    const a = Date.parse(segment.start), b = Date.parse(segment.end);
    if (a < previous || b < a || b > end) throw new Error("计时间段重叠或越界");
    previous = b;
  }
  const ids = new Set<string>();
  for (const marker of value.markers) {
    if (!object(marker) || typeof marker.id !== "string" || !DESKTOP_ID.test(marker.id) || ids.has(marker.id.toLowerCase())
      || !timestamp(marker.at) || !["good", "distraction"].includes(String(marker.kind))
      || !["light", "medium", "heavy"].includes(String(marker.level))
      || !value.segments.some(segment => Date.parse(segment.start) <= Date.parse(marker.at as string) && Date.parse(marker.at as string) < Date.parse(segment.end))) throw new Error("状态点格式无效");
    ids.add(marker.id.toLowerCase());
  }
  if (value.minimumRecordSeconds != null && (!Number.isInteger(value.minimumRecordSeconds) || (value.minimumRecordSeconds as number) < 0 || (value.minimumRecordSeconds as number) > 3600)) throw new Error("短计时阈值无效");
  planSource(value.sourcePlan, value.projectPath);
  const session = value as unknown as DesktopSession;
  return { ...session, id: session.id.toLowerCase(), markers: session.markers.map(marker => ({ ...marker, id: marker.id.toLowerCase() })) };
}

/** Legacy sessions keep minute rounding; newly configured sessions retain second precision. */
export function desktopEntries(session: DesktopSession, options: { preview?: boolean } = {}): DesktopEntry[] {
  const entries: DesktopEntry[] = [];
  const seconds = session.segments.reduce((sum, part) => sum + (Date.parse(part.end) - Date.parse(part.start)) / 1000, 0);
  if (!options.preview && seconds + 1e-8 < (session.minimumRecordSeconds ?? 60)) return entries;
  const precise = session.minimumRecordSeconds != null;
  const source = planSource(session.sourcePlan, session.projectPath);
  let elapsed = 0, allocated = 0;
  session.segments.forEach((segment, segmentIndex) => {
    let cursor = new Date(segment.start); const end = new Date(segment.end); let part = 0;
    while (cursor < end) {
      const logical = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - (cursor.getHours() < 2 ? 1 : 0));
      const boundary = new Date(logical.getFullYear(), logical.getMonth(), logical.getDate() + 1, 2);
      const until = new Date(Math.min(end.getTime(), boundary.getTime()));
      elapsed += (until.getTime() - cursor.getTime()) / 60000;
      const rounded = precise ? elapsed : Math.floor(elapsed + 1e-8);
      const minutes = rounded - allocated;
      allocated = rounded;
      if (minutes > 0) {
        const endMinute = until.getTime() === boundary.getTime() ? 1560 : dayMinute(until, logical, precise);
        const id = `desktop-${session.id}-${segmentIndex}-${part}`;
        const entry: DesktopEntry = { date: dateKey(logical), item: { ...(source ? { ...source.item, branchId: source.source.date === dateKey(logical) ? source.item.branchId : undefined } : {}), id, title: session.title.trim(), kind: "fact",
          startMin: Math.max(120, endMinute - minutes), endMin: endMinute, projectPath: session.projectPath,
          projectLogPath: session.projectPath, projectLogId: id, note: session.note.trim() || undefined }, distractions: [], goodStates: [] };
        if (source) {
          delete entry.item.plannedMin; delete entry.item.plannedEndMin; delete entry.item.startedMin;
          entry.item.factTiming = false; entry.item.sourcePlanId = source.source.id; entry.item.sourcePlanDate = source.source.date;
        }
        for (const mark of session.markers.filter(mark => new Date(mark.at) >= cursor && new Date(mark.at) < until)) {
          const date = new Date(mark.at);
          const minute = Math.max(entry.item.startMin!, Math.min(endMinute, dayMinute(date, logical, precise)));
          const event = { id: `desktop-${mark.id}`, minute, itemId: id };
          if (mark.kind === "good") entry.goodStates.push(event); else entry.distractions.push({ ...event, level: mark.level });
        }
        entries.push(entry);
      }
      cursor = until; part++;
    }
  });
  return entries;
}

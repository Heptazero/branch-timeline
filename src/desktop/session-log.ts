import { appendProjectLog, projectWorkLogEntry, projectLogHours } from "../vault/format";
import type { PluginCommentStyle } from "../vault/comment-markers";

export function desktopWorkLog(content: string, date: string, time: string, minutes: number, note: string, id: string, style: PluginCommentStyle): string {
  const entry = projectWorkLogEntry(content, id);
  if (entry) {
    if (entry.time !== time || entry.hours !== projectLogHours(minutes / 60)) throw new Error("相同编号的工时日志已被修改，未重复导入");
    return content;
  }
  return appendProjectLog(content, date, time, minutes / 60, note, id, style);
}

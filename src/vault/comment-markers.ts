export type PluginCommentStyle = "html" | "obsidian";
export type PluginMarkerKind = "date" | "work" | "task-total";

const NAMES: Record<PluginMarkerKind, string> = {
  date: "btl",
  work: "btl-work",
  "task-total": "btl-task-total"
};

export interface PluginMarkerMatch {
  text: string;
  value: string;
  style: PluginCommentStyle;
  index: number;
}

export function pluginMarker(kind: PluginMarkerKind, value: string, style: PluginCommentStyle): string {
  const body = `${NAMES[kind]}:${value}`;
  return style === "obsidian" ? `%%${body}%%` : `<!-- ${body} -->`;
}

export function findPluginMarker(line: string, kind: PluginMarkerKind): PluginMarkerMatch | null {
  const name = NAMES[kind];
  const pattern = new RegExp(`<!-- ${name}:([\\w-]+) -->|%%${name}:([\\w-]+)%%`);
  const match = pattern.exec(line);
  if (!match) return null;
  return {
    text: match[0],
    value: match[1] || match[2],
    style: match[1] ? "html" : "obsidian",
    index: match.index
  };
}

export interface CommentConversion { content: string; count: number }

/** Change only plugin-owned markers in recognizable project log and task lines. */
export function convertPluginComments(content: string, style: PluginCommentStyle): CommentConversion {
  const lines = content.split("\n");
  let count = 0;
  let inLog = false;
  let fence: { char: string; length: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenced = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenced) {
      if (!fence) fence = { char: fenced[1][0], length: fenced[1].length };
      else if (fenced[1][0] === fence.char && fenced[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    if (/^##\s+/.test(line)) inLog = line.trim() === "## log";
    const kind: PluginMarkerKind | null = inLog && /^-\s+\d{4}\s+\[\d+(?:\.\d+)?h\]/.test(line)
      ? "date"
      : inLog && /^\s*-\s+\[\d{2}:\d{2}\]\s+\d+(?:\.\d+)?h/.test(line)
        ? "work"
        : /^\s*[-*+]\s+\[[ xX]\].*（累计\s*\d+(?:\.\d+)?h）/.test(line)
          ? "task-total" : null;
    if (!kind) continue;
    const marker = findPluginMarker(line, kind);
    if (!marker || marker.style === style) continue;
    const tail = line.slice(marker.index + marker.text.length);
    if (kind === "task-total") {
      if (!/^\s+\^[\w-]+\s*$/.test(tail) || tail.trim() !== `^${marker.value}`) continue;
    } else if (tail.trim()) continue;
    lines[index] = `${line.slice(0, marker.index)}${pluginMarker(kind, marker.value, style)}${tail}`;
    count += 1;
  }
  return { content: count ? lines.join("\n") : content, count };
}

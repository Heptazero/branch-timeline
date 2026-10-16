import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { findPluginMarker } from "../vault/comment-markers";
import type { PluginMarkerKind } from "../vault/comment-markers";

function markerKind(line: string): PluginMarkerKind | null {
  if (/^-\s+\d{4}\s+\[\d+(?:\.\d+)?h\]/.test(line)) return "date";
  if (/^\s*-\s+\[\d{2}:\d{2}\]\s+\d+(?:\.\d+)?h/.test(line)) return "work";
  if (/^\s*[-*+]\s+\[[ xX]\].*（累计\s*\d+(?:\.\d+)?h）/.test(line)) return "task-total";
  return null;
}

function hiddenComments(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const visible of view.visibleRanges) {
    let position = view.state.doc.lineAt(visible.from).from;
    while (position <= visible.to) {
      const line = view.state.doc.lineAt(position);
      const kind = markerKind(line.text);
      if (kind) {
        const marker = findPluginMarker(line.text, kind);
        if (marker) {
          const tail = line.text.slice(marker.index + marker.text.length);
          const valid = kind === "task-total" ? tail.trim() === `^${marker.value}` : !tail.trim();
          if (valid) {
            const from = line.from + marker.index - (line.text[marker.index - 1] === " " ? 1 : 0);
            const to = line.from + marker.index + marker.text.length;
            const selected = view.state.selection.ranges.some(selection => selection.from < to && selection.to > from);
            if (!selected) ranges.push(Decoration.replace({}).range(from, to));
          }
        }
      }
      if (line.to >= visible.to || line.number === view.state.doc.lines) break;
      position = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

export const hiddenPluginCommentsExtension = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = hiddenComments(view); }
  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = hiddenComments(update.view);
    }
  }
}, { decorations: plugin => plugin.decorations });

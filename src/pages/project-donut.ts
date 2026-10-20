import { projectHours, type ProjectListEntry } from "./project-list-model";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ProjectDonutSegment {
  path: string;
  name: string;
  color: string;
  minutes: number;
  fraction: number;
  start: number;
  end: number;
}

export interface ProjectDonutData {
  totalMinutes: number;
  segments: ProjectDonutSegment[];
}

/** Uses only the already filtered project list, never unrelated state or targets. */
export function buildProjectDonut(entries: readonly ProjectListEntry[]): ProjectDonutData {
  const recorded = entries.filter(entry => Number.isFinite(entry.summary.actual) && entry.summary.actual > 0);
  if (!recorded.length) return { totalMinutes: 0, segments: [] };
  const maximum = Math.max(...recorded.map(entry => entry.summary.actual));
  const scaledTotal = recorded.reduce((sum, entry) => sum + entry.summary.actual / maximum, 0);
  const totalMinutes = Math.min(Number.MAX_VALUE, maximum * scaledTotal);
  let start = 0;
  const segments = recorded.map((entry, index) => {
    const fraction = entry.summary.actual / maximum / scaledTotal;
    const end = index === recorded.length - 1 ? 1 : Math.min(1, start + fraction);
    const segment = {
      path: entry.project.path,
      name: entry.project.name,
      color: entry.project.color || "var(--text-muted)",
      minutes: entry.summary.actual,
      fraction: end - start,
      start,
      end
    };
    start = end;
    return segment;
  });
  return { totalMinutes, segments };
}

/** Existing project rows remain the legend; touching an arc reveals its exact value. */
export function renderProjectDonut(
  container: HTMLElement,
  entries: readonly ProjectListEntry[],
  scopeLabel: string
): HTMLElement {
  const data = buildProjectDonut(entries);
  const root = container.createDiv({ cls: "btl-project-donut" });
  root.toggleClass("is-empty", !data.segments.length);
  const plot = root.createDiv({ cls: "btl-project-donut-plot" });
  const doc = container.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 128 128");
  svg.setAttribute("class", "btl-project-donut-svg");
  svg.setAttribute("role", "group");
  const label = scopeLabel.endsWith("总计") ? scopeLabel : `${scopeLabel}总计`;
  const total = projectHours(data.totalMinutes);
  svg.setAttribute("aria-label", `${label} ${total}${data.segments.length ? "，项目时间占比" : "，暂无记录"}`);
  plot.appendChild(svg);
  const track = doc.createElementNS(SVG_NS, "circle");
  track.setAttribute("cx", "64");
  track.setAttribute("cy", "64");
  track.setAttribute("r", "49");
  track.setAttribute("class", "btl-project-donut-track");
  track.setAttribute("aria-hidden", "true");
  svg.appendChild(track);
  const center = plot.createDiv({ cls: "btl-project-donut-center", attr: { "aria-hidden": "true" } });
  center.createSpan({ cls: "btl-project-donut-scope", text: label });
  center.createEl("strong", { text: total, attr: { title: total } });
  const detail = root.createDiv({ cls: "btl-project-donut-detail", attr: { "aria-live": "polite" } });
  for (const segment of data.segments) {
    const arc = doc.createElementNS(SVG_NS, "path");
    const percent = `${Number((segment.fraction * 100).toFixed(1))}%`;
    const description = `${segment.name} · ${projectHours(segment.minutes)} · ${percent}`;
    arc.setAttribute("d", arcPath(segment.start, segment.end));
    arc.setAttribute("fill", segment.color);
    arc.setAttribute("class", "btl-project-donut-segment");
    arc.setAttribute("tabindex", "0");
    arc.setAttribute("role", "button");
    arc.setAttribute("aria-label", description);
    arc.setAttribute("aria-pressed", "false");
    const title = doc.createElementNS(SVG_NS, "title");
    title.textContent = description;
    arc.appendChild(title);
    const select = (): void => {
      svg.querySelectorAll(".btl-project-donut-segment").forEach(other => other.setAttribute("aria-pressed", String(other === arc)));
      detail.setText(description);
      detail.title = description;
    };
    arc.addEventListener("click", event => { event.stopPropagation(); select(); });
    arc.addEventListener("focus", select);
    arc.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") select(); });
    arc.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); select(); }
    });
    svg.appendChild(arc);
  }
  return root;
}

function arcPath(start: number, end: number): string {
  const point = (fraction: number, radius: number): string => {
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    return `${64 + Math.cos(angle) * radius},${64 + Math.sin(angle) * radius}`;
  };
  // Two half-arcs also draw the full-circle case without coincident endpoints.
  const middle = (start + end) / 2;
  return `M${point(start, 56)} A56,56 0 0 1 ${point(middle, 56)} A56,56 0 0 1 ${point(end, 56)}` +
    ` L${point(end, 42)} A42,42 0 0 0 ${point(middle, 42)} A42,42 0 0 0 ${point(start, 42)} Z`;
}

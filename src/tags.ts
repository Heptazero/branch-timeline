import type { TimelineTag } from "./types";

const FALLBACK_COLOR = "#6b7280";

export const DEFAULT_TAGS: readonly TimelineTag[] = [
  { id: "work", name: "工作", category: "work", color: "#e5b94b" },
  { id: "explore", name: "探索", category: "explore", color: "#8b5cf6" },
  { id: "focus", name: "专注", category: "", color: "#3b82f6" },
  { id: "leisure", name: "摸鱼", category: "", color: "#2f3337" },
  { id: "rest", name: "休息", category: "", color: "#22a06b" }
];

export function cloneDefaultTags(): TimelineTag[] {
  return DEFAULT_TAGS.map(tag => ({ ...tag }));
}

export function loadTags(savedTags: unknown, legacyMap?: unknown): TimelineTag[] {
  if (Array.isArray(savedTags)) return savedTags.flatMap((value, index) => normalizeTag(value, index));
  if (legacyMap && typeof legacyMap === "object") {
    return Object.entries(legacyMap as Record<string, unknown>).map(([name, category], index) => ({
      id: stableId(name, index),
      name,
      category: typeof category === "string" ? category.trim() : "",
      color: DEFAULT_TAGS.find(tag => tag.name === name)?.color || FALLBACK_COLOR
    }));
  }
  return cloneDefaultTags();
}

export function createTag(existing: readonly TimelineTag[]): TimelineTag {
  const suffix = existing.length + 1;
  return {
    id: `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `标签 ${suffix}`,
    category: "",
    color: FALLBACK_COLOR
  };
}

function normalizeTag(value: unknown, index: number): TimelineTag[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as Partial<TimelineTag>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) return [];
  return [{
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : stableId(name, index),
    name,
    category: typeof candidate.category === "string" ? candidate.category.trim() : "",
    color: typeof candidate.color === "string" && /^#[0-9a-f]{6}$/i.test(candidate.color)
      ? candidate.color
      : FALLBACK_COLOR
  }];
}

function stableId(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");
  return `tag-${slug || index + 1}`;
}

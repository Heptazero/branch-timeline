export interface ProjectTaskHeading {
  key: string;
  title: string;
  path: string[];
  level: number;
  depth: number;
  line: number;
}

export interface ProjectTaskEntry {
  id?: string;
  title: string;
  headingKey: string;
  headingPath: string[];
  line: number;
}

export type ProjectWorkTask =
  | { kind: "existing"; entry: ProjectTaskEntry }
  | { kind: "new"; title: string; headingKey: string };

export interface ProjectTaskIndex {
  headings: ProjectTaskHeading[];
  tasks: ProjectTaskEntry[];
}

const BLOCK_ID = /\s+\^([\w-]+)\s*$/;
const OWNED_TOTAL = /\s*（累计\s*\d+(?:\.\d+)?h）\s*<!-- btl-task-total:([\w-]+) -->/;

export function normalizeTaskHeadings(values: readonly string[] | undefined): string[] {
  const normalized = (values || []).map(value => value.replace(/^#{1,6}\s*/, "").split("/").map(part => part.trim()).filter(Boolean).join(" / ")).filter(Boolean);
  return [...new Set(normalized.length ? normalized : ["任务"])];
}

export function indexProjectTasks(content: string, configured: readonly string[]): ProjectTaskIndex {
  const lines = content.split("\n");
  const roots = normalizeTaskHeadings(configured);
  const headings: ProjectTaskHeading[] = [];
  const tasks: ProjectTaskEntry[] = [];
  const stack: Array<ProjectTaskHeading & { included: boolean }> = [];
  const occurrences = new Map<string, number>();
  let fence: { char: string; length: number } | null = null;
  for (let line = 0; line < lines.length; line += 1) {
    const fenced = lines[line].match(/^\s*(`{3,}|~{3,})/);
    if (fenced) {
      if (!fence) fence = { char: fenced[1][0], length: fenced[1].length };
      else if (fenced[1][0] === fence.char && fenced[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = lines[line].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const path = [...(stack.at(-1)?.path || []), title];
      const pathKey = path.join(" / ");
      const occurrence = occurrences.get(pathKey) || 0;
      occurrences.set(pathKey, occurrence + 1);
      const key = `${pathKey}\u001f${occurrence}`;
      const parent = stack.at(-1);
      const included = !!parent?.included || roots.some(root => root === title || root === pathKey);
      const entry = { key, title, path, level, depth: parent?.included ? parent.depth + 1 : 0, line, included };
      stack.push(entry);
      if (included) headings.push(entry);
      continue;
    }
    const current = stack.at(-1);
    if (!current?.included) continue;
    const task = lines[line].match(/^\s*[-*+]\s+\[ \]\s+(.+?)\s*$/);
    if (!task) continue;
    const id = lines[line].match(BLOCK_ID)?.[1];
    const title = task[1].replace(BLOCK_ID, "").replace(OWNED_TOTAL, "").trim();
    tasks.push({ id, title, headingKey: current.key, headingPath: current.path, line });
  }
  return { headings, tasks };
}

export function ensureProjectTaskId(content: string, task: ProjectTaskEntry, id: string): string {
  if (task.id) return content;
  const lines = content.split("\n");
  const indexed = indexProjectTasks(content, task.headingPath.length ? [task.headingPath.join(" / ")] : ["任务"]);
  const match = indexed.tasks.find(entry => entry.line === task.line && entry.title === task.title && entry.headingKey === task.headingKey);
  if (!match) throw new Error("项目任务已经改变，请重新选择");
  if (lines.some(line => line.match(BLOCK_ID)?.[1] === id)) throw new Error("项目任务 ID 已存在");
  lines[task.line] = `${lines[task.line].trimEnd()} ^${id}`;
  return lines.join("\n");
}

export function appendProjectTaskAtHeading(content: string, title: string, id: string, headingKey: string, configured: readonly string[]): string {
  const lines = content.split("\n");
  const heading = indexProjectTasks(content, configured).headings.find(entry => entry.key === headingKey);
  if (!heading) throw new Error("任务标题已经改变，请重新选择");
  let insertAt = lines.length;
  for (let line = heading.line + 1; line < lines.length; line += 1) {
    const next = lines[line].match(/^(#{1,6})\s+/);
    if (next) { insertAt = line; break; }
  }
  while (insertAt > heading.line + 1 && !lines[insertAt - 1].trim()) insertAt -= 1;
  lines.splice(insertAt, 0, `- [ ] ${title.trim()} ^${id}`);
  return lines.join("\n");
}

export function linkProjectTask(content: string, configured: readonly string[], task: ProjectWorkTask, id: string): string {
  if (task.kind === "new") return appendProjectTaskAtHeading(content, task.title, id, task.headingKey, configured);
  if (task.entry.id && task.entry.id !== id) throw new Error("关联任务 ID 不一致");
  const current = indexProjectTasks(content, configured);
  const found = task.entry.id
    ? current.tasks.some(entry => entry.id === task.entry.id && entry.title === task.entry.title)
    : current.tasks.some(entry => entry.line === task.entry.line && entry.title === task.entry.title && entry.headingKey === task.entry.headingKey);
  if (!found) throw new Error("项目任务已经改变，请重新选择");
  return ensureProjectTaskId(content, task.entry, id);
}

export function upsertProjectTaskTotals(content: string, totals: ReadonlyMap<string, number>): string {
  const lines = content.split("\n");
  const found = new Set<string>();
  for (let line = 0; line < lines.length; line += 1) {
    if (!/^\s*[-*+]\s+\[[ xX]\]/.test(lines[line])) continue;
    const id = lines[line].match(BLOCK_ID)?.[1];
    if (!id) continue;
    const owned = lines[line].match(OWNED_TOTAL)?.[1];
    if (!totals.has(id) && !owned) continue;
    if (!owned && /（累计\s*\d+(?:\.\d+)?h）/.test(lines[line])) {
      throw new Error(`任务 ${id} 已有手写累计时长，请手动检查`);
    }
    found.add(id);
    const clean = lines[line].replace(OWNED_TOTAL, "").replace(BLOCK_ID, "").trimEnd();
    const minutes = totals.get(id) || 0;
    const total = minutes > 0 ? ` （累计 ${Number((minutes / 60).toFixed(2))}h） <!-- btl-task-total:${id} -->` : "";
    lines[line] = `${clean}${total} ^${id}`;
  }
  for (const id of totals.keys()) if (!found.has(id)) throw new Error(`找不到关联任务 ${id}，请检查项目笔记`);
  return lines.join("\n");
}

export function fuzzyMatchProjectTask(value: string, query: string): boolean {
  if (!query) return true;
  const haystack = value.normalize("NFC").toLowerCase();
  const needle = query.normalize("NFC").toLowerCase();
  if (haystack.includes(needle)) return true;
  let position = 0;
  for (const char of needle) {
    position = haystack.indexOf(char, position);
    if (position < 0) return false;
    position += 1;
  }
  return true;
}

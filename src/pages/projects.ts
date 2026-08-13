import type { ProjectRef } from "../types";

interface ProjectGroup {
  label: string;
  matches: (status: string) => boolean;
}

const PROJECT_GROUPS: readonly ProjectGroup[] = [
  { label: "进行中", matches: status => ["active", "doing", "进行中"].includes(status) },
  { label: "计划", matches: status => ["todo", "plan", "planned", "计划", ""].includes(status) },
  { label: "搁置", matches: status => ["hold", "paused", "搁置"].includes(status) },
  { label: "归档", matches: status => ["done", "archived", "archive", "归档"].includes(status) }
];

export function renderProjectsPage(
  container: HTMLElement,
  projects: readonly ProjectRef[],
  openProject: (path: string) => void
): void {
  if (!projects.length) {
    container.createDiv({ cls: "btl-empty", text: "暂无项目" });
    return;
  }

  const assigned = new Set<string>();
  for (const group of PROJECT_GROUPS) {
    const entries = projects.filter(project => group.matches(project.status));
    if (!entries.length) continue;
    renderProjectSection(container, group.label, entries, assigned, openProject);
  }

  const other = projects.filter(project => !assigned.has(project.path));
  if (other.length) renderProjectSection(container, "其他", other, assigned, openProject, true);
}

function renderProjectSection(
  container: HTMLElement,
  label: string,
  projects: readonly ProjectRef[],
  assigned: Set<string>,
  openProject: (path: string) => void,
  useProjectStatus = false
): void {
  const section = container.createDiv({ cls: "btl-project-section" });
  section.createEl("h3", { text: label });
  const grid = section.createDiv({ cls: "btl-project-grid" });
  for (const project of projects) {
    assigned.add(project.path);
    const card = grid.createEl("button", { cls: "btl-project-card" });
    card.createSpan({ cls: "btl-project-card-title", text: project.name });
    card.createSpan({ cls: "btl-project-card-status", text: useProjectStatus ? project.status || "未分类" : label });
    card.onclick = () => openProject(project.path);
  }
}

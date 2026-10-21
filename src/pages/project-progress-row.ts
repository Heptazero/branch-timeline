import { Menu, setIcon } from "obsidian";
import type { ProjectRef } from "../types";
import { projectHours, projectProgressPercent, type ProjectListEntry } from "./project-list-model";
import type { ProjectTimeScope } from "./project-time";

export interface ProjectProgressOptions {
  scope: ProjectTimeScope;
  expected: number;
  maximum: number;
  pinned: boolean;
  manual: boolean;
  open: (path: string) => void;
  openFile: (path: string) => void;
  setPlan: (path: string, scope: "day" | "week", anchor: HTMLElement) => void;
  togglePin: (path: string) => void;
}

export function renderProjectProgressRow(parent: HTMLElement, entry: ProjectListEntry, options: ProjectProgressOptions): void {
  const { project, summary } = entry;
  const row = parent.createEl("article", {
    cls: `btl-progress-row${options.pinned ? " is-pinned" : ""}${summary.planned > 0 ? " has-plan" : ""}`,
    attr: { "data-project-path": project.path }
  });
  row.style.setProperty("--btl-project-color", project.color || "var(--text-muted)");
  const head = row.createDiv({ cls: "btl-progress-head" });
  const name = head.createEl("button", { cls: "btl-progress-open", attr: { type: "button", title: project.name } });
  name.createSpan({ text: project.name });
  if (options.pinned) setIcon(name.createSpan({ cls: "btl-progress-pin" }), "pin");
  name.onclick = () => { if (row.dataset.suppressClick !== "true") options.open(project.path); };
  const percent = options.scope === "total" ? "无" : projectProgressPercent(summary.actual, summary.planned);
  head.createSpan({ cls: "btl-progress-percent", text: percent, attr: {
    "aria-label": percent === "无" ? "未设目标，无完成比例" : `完成比例 ${percent}`
  } });
  const line = row.createDiv({ cls: "btl-progress-line" });
  const meter = line.createDiv({ cls: "btl-progress-meter" });
  const track = meter.createEl("button", { cls: "btl-progress-track", attr: { type: "button", "aria-label": `打开${project.name}时间线` } });
  track.onclick = () => { if (row.dataset.suppressClick !== "true") options.open(project.path); };
  const amount = meter.createDiv({ cls: "btl-progress-amount" });
  amount.createEl("strong", { text: projectHours(summary.actual) });
  if (options.scope !== "total") {
    const target = amount.createEl("button", {
      cls: "btl-progress-goal",
      text: summary.planned ? projectHours(summary.planned) : "无",
      attr: { type: "button", "aria-label": `设置${project.name}${options.scope === "week" ? "本周" : "今日"}目标` }
    });
    target.onclick = () => options.setPlan(project.path, options.scope as "day" | "week", target);
  } else amount.createSpan({ cls: "btl-progress-goal-empty", text: "无", attr: { title: "累计视图不设目标" } });
  const menu = line.createEl("button", { cls: "btl-progress-menu", text: "⋮", attr: { type: "button", "aria-label": `${project.name}菜单` } });
  menu.onclick = () => openMenu(menu, project, options);
  const hasScale = summary.planned > 0 || options.scope === "total";
  const fraction = summary.planned ? summary.actual / summary.planned : summary.actual / Math.max(1, options.maximum);
  if (hasScale) {
    const fill = track.createSpan({ cls: "btl-progress-fill" });
    fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    if (summary.planned && fraction >= 1) row.addClass("is-complete");
  } else if (summary.actual > 0) track.addClass("is-unplanned");
  if (summary.planned && options.scope !== "total") {
    const marker = track.createSpan({ cls: "btl-progress-expected" });
    marker.style.left = `${Math.max(0, Math.min(1, options.expected)) * 100}%`;
    track.title = `已完成 ${projectHours(summary.actual)} / 计划 ${projectHours(summary.planned)}；按均匀计划应到 ${projectHours(summary.planned * options.expected)}`;
  } else track.title = summary.actual ? `已记录 ${projectHours(summary.actual)}` : "尚无记录";
  if (options.manual) {
    const handle = line.createEl("button", { cls: "btl-progress-drag", attr: { type: "button", "aria-label": options.pinned ? "调整置顶项目顺序" : "拖动排序", title: options.pinned ? "调整置顶项目顺序" : "拖动排序" } });
    setIcon(handle, "grip-vertical");
  }
}

function openMenu(anchor: HTMLElement, project: ProjectRef, options: ProjectProgressOptions): void {
  const menu = new Menu();
  const row = anchor.closest<HTMLElement>(".btl-progress-row");
  if (row) row.dataset.menuOpen = "true";
  menu.onHide(() => { if (row) delete row.dataset.menuOpen; });
  menu.addItem(item => item.setTitle("打开项目文件").setIcon("file-text").onClick(() => options.openFile(project.path)));
  if (options.scope !== "total") menu.addItem(item => item.setTitle("设置目标").setIcon("timer")
    .onClick(() => options.setPlan(project.path, options.scope as "day" | "week", anchor)));
  menu.addSeparator();
  menu.addItem(item => item.setTitle(options.pinned ? "取消置顶" : "置顶").setIcon(options.pinned ? "pin-off" : "pin")
    .onClick(() => options.togglePin(project.path)));
  const rect = anchor.getBoundingClientRect();
  menu.showAtPosition({ x: rect.right, y: rect.bottom });
}

import { setIcon } from "obsidian";
import { formatTime } from "../timeline/model";
import type { Achievement, AchievementRecord } from "../types";
import { achievementStats, sortAchievementRecords } from "./achievement-model";

export interface AchievementsPageOptions {
  container: HTMLElement;
  achievements: readonly Achievement[];
  onOpen: (achievement: Achievement) => void;
  onMenu: (achievement: Achievement, event: PointerEvent) => void;
}

export interface AchievementDetailOptions {
  container: HTMLElement;
  achievement: Achievement;
  onBack: () => void;
  onEditRecord: (record: AchievementRecord) => void;
  onRecordMenu: (record: AchievementRecord, event: PointerEvent) => void;
  onMenu: (event: PointerEvent) => void;
}

export function renderAchievementsPage(options: AchievementsPageOptions): void {
  const grid = options.container.createDiv({ cls: "btl-achievement-grid" });
  for (const achievement of options.achievements) {
    const stats = achievementStats(achievement);
    const card = grid.createDiv({
      cls: "btl-achievement-card",
      attr: { "data-achievement-id": achievement.id, role: "button", tabindex: "0" }
    });
    card.style.setProperty("--btl-achievement-color", achievement.color);
    card.onclick = event => {
      if (!(event.target as HTMLElement).closest("button")) options.onOpen(achievement);
    };
    card.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); options.onOpen(achievement); }
    };
    const head = card.createDiv({ cls: "btl-achievement-head" });
    head.createEl("h3", { text: achievement.name });
    const menu = head.createEl("button", { attr: { "aria-label": "成就菜单" } });
    menu.createSpan({ text: "⋮" });
    menu.onpointerdown = event => {
      event.preventDefault();
      event.stopPropagation();
      options.onMenu(achievement, event);
    };
    const total = card.createDiv({ cls: "btl-achievement-total" });
    total.createEl("strong", { text: String(stats.total) });
    total.createSpan({ text: "条记录" });
    const meta = card.createDiv({ cls: "btl-achievement-meta" });
    meta.createSpan({ text: stats.latest ? `${shortDate(stats.latest.date)} ${formatTime(stats.latest.minute)}` : "暂无记录" });
    if (stats.current > 1) meta.createSpan({ text: `最近连续 ${stats.current} 天` });
  }
}

export function renderAchievementDetail(options: AchievementDetailOptions): void {
  const { achievement } = options;
  const page = options.container.createDiv({ cls: "btl-achievement-detail" });
  page.style.setProperty("--btl-achievement-color", achievement.color);
  const header = page.createDiv({ cls: "btl-achievement-detail-head" });
  const back = header.createEl("button", { attr: { "aria-label": "返回" } });
  setIcon(back, "chevron-left");
  header.createEl("h2", { text: achievement.name });
  const menu = header.createEl("button", { attr: { "aria-label": "成就菜单" } });
  menu.createSpan({ text: "⋮" });
  menu.onpointerdown = event => {
    event.preventDefault();
    event.stopPropagation();
    options.onMenu(event);
  };
  back.onclick = options.onBack;

  const records = sortAchievementRecords(achievement.records);
  if (!records.length) {
    page.createDiv({ cls: "btl-empty", text: "暂无记录" });
    return;
  }
  const timeline = page.createDiv({ cls: "btl-achievement-timeline" });
  for (const record of records) renderRecord(timeline, record, options);
}

function renderRecord(container: HTMLElement, record: AchievementRecord, options: AchievementDetailOptions): void {
  const row = container.createDiv({ cls: "btl-achievement-record" });
  const when = row.createDiv({ cls: "btl-achievement-record-when" });
  when.createEl("strong", { text: shortDate(record.date) });
  when.createSpan({ text: formatTime(record.minute) });
  row.createDiv({ cls: "btl-achievement-record-dot" });
  const card = row.createDiv({ cls: "btl-achievement-record-card", attr: { role: "button", tabindex: "0" } });
  card.createDiv({ cls: record.note ? "btl-achievement-record-note" : "btl-achievement-record-note is-empty", text: record.note || "记录" });
  const menu = card.createEl("button", { attr: { "aria-label": "记录菜单" } });
  menu.createSpan({ text: "⋮" });
  menu.onpointerdown = event => {
    event.preventDefault();
    event.stopPropagation();
    options.onRecordMenu(record, event);
  };
  card.onclick = event => {
    if (!(event.target as HTMLElement).closest("button")) options.onEditRecord(record);
  };
  card.onkeydown = event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); options.onEditRecord(record); }
  };
}

function shortDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year === String(new Date().getFullYear()) ? `${Number(month)}/${Number(day)}` : `${year}/${Number(month)}/${Number(day)}`;
}

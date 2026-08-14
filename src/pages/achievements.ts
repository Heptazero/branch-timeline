import type { Achievement } from "../types";
import { dateKey } from "../vault/format";
import { startOfWeek } from "./navigation";

export interface AchievementsPageOptions {
  container: HTMLElement;
  date: Date;
  achievements: readonly Achievement[];
  onAdd: () => void;
  onToggle: (achievementId: string, date: string) => void;
  onMenu: (achievement: Achievement, event: PointerEvent) => void;
}

export function renderAchievementsPage(options: AchievementsPageOptions): void {
  const { container, achievements } = options;
  const dates = weekDates(options.date);
  const grid = container.createDiv({ cls: "btl-achievement-grid" });
  grid.ondblclick = event => {
    if (!(event.target as HTMLElement).closest(".btl-achievement-card, button")) options.onAdd();
  };

  for (const achievement of achievements) {
    const card = grid.createDiv({ cls: "btl-achievement-card", attr: { "data-achievement-id": achievement.id } });
    card.style.setProperty("--btl-achievement-color", achievement.color);
    const head = card.createDiv({ cls: "btl-achievement-head" });
    head.createEl("h3", { text: achievement.name });
    const menu = head.createEl("button", { text: "⋮", attr: { "aria-label": "成就菜单" } });
    menu.onpointerdown = event => {
      event.preventDefault();
      event.stopPropagation();
      options.onMenu(achievement, event);
    };
    const stats = streakStats(achievement, dateKey(options.date));
    const streak = card.createEl("button", { cls: "btl-achievement-streak", attr: { "aria-label": "切换今日达成" } });
    streak.createEl("strong", { text: String(stats.current) });
    streak.createSpan({ text: "天" });
    streak.onclick = () => options.onToggle(achievement.id, dateKey(options.date));

    const week = card.createDiv({ cls: "btl-achievement-week" });
    for (const date of dates) {
      const key = dateKey(date);
      const cell = week.createEl("button", {
        cls: `${achievement.manualDates.includes(key) ? "is-done" : ""}${key === dateKey(options.date) ? " is-current" : ""}`.trim(),
        attr: { "aria-label": key }
      });
      cell.createSpan({ text: String(date.getDate()) });
      cell.onclick = () => options.onToggle(achievement.id, key);
    }
  }
}

function weekDates(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function streakStats(achievement: Achievement, through: string): { current: number; best: number } {
  const dates = [...new Set(achievement.manualDates)].filter(date => date <= through).sort();
  if (!dates.length) return { current: 0, best: 0 };
  const completed = new Set(dates);
  let current = 0;
  let best = 0;
  let run = 0;
  for (let cursor = new Date(`${dates[0]}T12:00:00`); dateKey(cursor) <= through; cursor.setDate(cursor.getDate() + 1)) {
    if (completed.has(dateKey(cursor))) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  const throughDate = new Date(`${through}T12:00:00`);
  if (!completed.has(through)) throughDate.setDate(throughDate.getDate() - 1);
  while (completed.has(dateKey(throughDate))) {
    current += 1;
    throughDate.setDate(throughDate.getDate() - 1);
  }
  return { current, best };
}

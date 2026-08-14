import type { DiaryDaySnapshot } from "../types";
import { startOfWeek } from "./navigation";

export interface HabitPageOptions {
  container: HTMLElement;
  date: Date;
  habits: readonly string[];
  readDay: (date: Date) => Promise<DiaryDaySnapshot>;
  setHabit: (date: Date, habit: string, done: boolean) => Promise<void>;
  isCurrent: () => boolean;
  refresh: () => Promise<void>;
  onAdd: () => void;
}

export async function renderHabitsPage(options: HabitPageOptions): Promise<void> {
  const { container, date, habits, readDay, setHabit, isCurrent, refresh } = options;
  container.ondblclick = event => {
    if (!(event.target as HTMLElement).closest(".btl-habit-week, button")) options.onAdd();
  };
  const start = startOfWeek(date);
  const dates = Array.from({ length: 7 }, (_, index) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  );
  const snapshots = await Promise.all(dates.map(readDay));
  if (!isCurrent()) return;

  if (!habits.length) {
    container.createDiv({ cls: "btl-empty", text: "暂无习惯" });
    return;
  }

  const table = container.createDiv({ cls: "btl-habit-week" });
  renderHeader(table, dates);
  for (const habit of habits) renderHabitRow(table, habit, dates, snapshots, setHabit, refresh);
}

function renderHeader(table: HTMLElement, dates: readonly Date[]): void {
  const header = table.createDiv({ cls: "btl-habit-week-row is-header" });
  header.createSpan({ text: "本周" });
  for (const date of dates) {
    const cell = header.createSpan();
    cell.createSpan({ text: weekdayLabel(date) });
    cell.createEl("small", { text: String(date.getDate()) });
  }
}

function renderHabitRow(
  table: HTMLElement,
  habit: string,
  dates: readonly Date[],
  snapshots: readonly DiaryDaySnapshot[],
  setHabit: HabitPageOptions["setHabit"],
  refresh: HabitPageOptions["refresh"]
): void {
  const row = table.createDiv({ cls: "btl-habit-week-row" });
  row.createSpan({ cls: "btl-habit-name", text: habit });
  dates.forEach((date, index) => {
    const done = !!snapshots[index].habits[habit];
    const button = row.createEl("button", {
      cls: `btl-habit-cell${done ? " is-done" : ""}`,
      attr: { "aria-label": `${habit} · ${date.getMonth() + 1}月${date.getDate()}日` }
    });
    button.onclick = async () => {
      await setHabit(date, habit, !done);
      await refresh();
    };
  });
}

function weekdayLabel(date: Date): string {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

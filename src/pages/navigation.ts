import { dateKey, logicalToday } from "../vault/format";

export type TimelinePage = "day" | "projects" | "habits" | "achievements" | "policy";

const PAGES: ReadonlyArray<{ id: TimelinePage; label: string }> = [
  { id: "day", label: "今天" },
  { id: "projects", label: "项目" },
  { id: "habits", label: "习惯" },
  { id: "achievements", label: "成就" },
  { id: "policy", label: "锚点" }
];

export function renderPageNavigation(
  container: HTMLElement,
  activePage: TimelinePage,
  onSelect: (page: TimelinePage) => void
): void {
  const navigation = container.createDiv({ cls: "btl-page-nav" });
  for (const page of PAGES) {
    const button = navigation.createEl("button", {
      text: page.label,
      cls: activePage === page.id ? "is-active" : ""
    });
    button.onclick = () => {
      if (activePage !== page.id) onSelect(page.id);
    };
  }
}

export function shiftPageDate(date: Date, page: TimelinePage, amount: number): Date {
  const step = page === "habits" ? amount * 7 : amount;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + step);
}

export function pageDateTitle(date: Date, page: TimelinePage): string {
  if (page === "habits") {
    const start = startOfWeek(date);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`;
  }
  const today = dateKey(date) === dateKey(logicalToday());
  return `${date.getMonth() + 1}月${date.getDate()}日${today ? " · 今天" : ""}`;
}

export function startOfWeek(date: Date): Date {
  const day = date.getDay() || 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day + 1);
}

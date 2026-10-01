import type { PolicyCard, PolicyEvent } from "../types";

export interface PolicyProgress {
  count: number;
  latest: PolicyEvent | null;
  settledToday: boolean;
}

export function policyProgress(
  card: PolicyCard,
  events: readonly PolicyEvent[],
  through: string,
  today: string
): PolicyProgress {
  const history = events
    .filter(event => event.cardId === card.id && event.date <= through)
    .sort(compareEvents);
  const latest = history.at(-1) || null;
  const settledToday = history.some(event => event.date === through);
  let lastViolation = -1;
  history.forEach((event, index) => { if (event.result === "violation") lastViolation = index; });
  const active = history.slice(lastViolation + 1).filter(event => event.result !== "violation");
  if (card.mode !== "daily") return { count: active.length, latest, settledToday };

  const completed = new Set(active.map(event => event.date));
  let cursor = parseDate(through);
  if (through === today && !settledToday) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (completed.has(dateText(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { count, latest, settledToday };
}

function compareEvents(a: PolicyEvent, b: PolicyEvent): number {
  return a.date.localeCompare(b.date) || (a.minute ?? 0) - (b.minute ?? 0) || a.id.localeCompare(b.id);
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateText(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

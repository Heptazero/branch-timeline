export class DailyReminderCache {
  private date: string | null = null;
  private timers = new Set<string>();
  private fixed = new Set<string>();

  selectDate(date: string): void {
    if (this.date === date) return;
    this.date = date;
    this.timers.clear();
    this.fixed.clear();
  }

  markTimer(key: string): boolean { return this.mark(this.timers, key); }
  markFixed(key: string): boolean { return this.mark(this.fixed, key); }

  private mark(seen: Set<string>, key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }
}

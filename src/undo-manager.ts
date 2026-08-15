export type UndoAction = () => void | Promise<void>;

interface UndoBatch {
  actions: UndoAction[];
  lastAt: number;
}

export class UndoManager {
  private history: UndoBatch[] = [];
  private current: UndoBatch | null = null;
  private timer: number | null = null;
  private replaying = false;

  get canUndo(): boolean { return !!this.current?.actions.length || this.history.length > 0; }

  record(action: UndoAction): void {
    if (this.replaying) return;
    const now = Date.now();
    if (!this.current || now - this.current.lastAt > 320) {
      this.flush();
      this.current = { actions: [], lastAt: now };
    }
    this.current.actions.push(action);
    this.current.lastAt = now;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 340);
  }

  async undo(): Promise<boolean> {
    this.flush();
    const batch = this.history.pop();
    if (!batch) return false;
    this.replaying = true;
    try {
      for (const action of [...batch.actions].reverse()) await action();
    } finally {
      this.replaying = false;
    }
    return true;
  }

  private flush(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    if (!this.current?.actions.length) { this.current = null; return; }
    this.history.push(this.current);
    if (this.history.length > 50) this.history.splice(0, this.history.length - 50);
    this.current = null;
  }
}

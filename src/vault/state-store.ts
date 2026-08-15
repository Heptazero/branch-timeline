import { App, normalizePath } from "obsidian";
import { normalizeTimelineDay } from "../rhythm";
import type { BranchTimelineState, PolicyNode, PolicyPeriod, RhythmSchedule, TimelineDayState } from "../types";
import type { UndoAction } from "../undo-manager";

const EMPTY_STATE: BranchTimelineState = {
  version: 1,
  days: {},
  projects: {},
  achievements: [],
  policyCards: [],
  policyNodes: [],
  policySides: [{ id: "policy-side-routine", name: "作息", mode: "dayparts" }],
  policyEvents: []
};

export class StateStore {
  private queue: Promise<void> = Promise.resolve();
  private recordUndo: ((action: UndoAction) => void) | null = null;

  constructor(private app: App, private path: string) {}

  setPath(path: string): void { this.path = path; }
  setUndoRecorder(record: (action: UndoAction) => void): void { this.recordUndo = record; }

  async load(): Promise<BranchTimelineState> {
    const path = normalizePath(this.path);
    if (!(await this.app.vault.adapter.exists(path))) return structuredClone(EMPTY_STATE);
    try {
      const parsed = JSON.parse(await this.app.vault.adapter.read(path)) as Partial<BranchTimelineState>;
      return {
        version: 1,
        days: parsed.days && typeof parsed.days === "object"
          ? Object.fromEntries(Object.entries(parsed.days).map(([date, day]) => [date, normalizeTimelineDay(day)]))
          : {},
        projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        policySides: Array.isArray(parsed.policySides) && parsed.policySides.length
          ? parsed.policySides
          : [{ id: "policy-side-routine", name: "作息", mode: "dayparts" }],
        policyCards: Array.isArray(parsed.policyCards)
          ? parsed.policyCards.map(card => ({ ...card, sideId: card.sideId || "policy-side-routine" }))
          : [],
        policyNodes: Array.isArray(parsed.policyNodes)
          ? parsed.policyNodes.map(node => normalizePolicyNode(node))
          : [],
        policyEvents: Array.isArray(parsed.policyEvents) ? parsed.policyEvents : []
      };
    } catch {
      return structuredClone(EMPTY_STATE);
    }
  }

  async update(mutator: (state: BranchTimelineState) => void): Promise<BranchTimelineState> {
    let result = structuredClone(EMPTY_STATE);
    this.queue = this.queue.then(async () => {
      result = await this.load();
      const before = structuredClone(result);
      mutator(result);
      await this.write(result);
      this.recordUndo?.(() => this.write(before));
    });
    await this.queue;
    return result;
  }

  async ensure(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(normalizePath(this.path)))) await this.write(EMPTY_STATE);
  }

  private async write(state: BranchTimelineState): Promise<void> {
    const path = normalizePath(this.path);
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent && !(await this.app.vault.adapter.exists(parent))) await this.mkdirRecursive(parent);
    await this.app.vault.adapter.write(path, `${JSON.stringify(state, null, 2)}\n`);
  }

  private async mkdirRecursive(path: string): Promise<void> {
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) await this.app.vault.adapter.mkdir(current);
    }
  }
}

function normalizePolicyNode(node: PolicyNode): PolicyNode {
  return { ...node, period: isPolicyPeriod(node.period) ? node.period : "morning" };
}

function isPolicyPeriod(value: unknown): value is PolicyPeriod {
  return value === "morning" || value === "afternoon" || value === "evening";
}

export function defaultDay(schedule: RhythmSchedule): TimelineDayState {
  return {
    ...schedule,
    wakeReal: false,
    napStartReal: false,
    napEndReal: false,
    sleepPrepReal: false,
    sleepReal: false,
    branches: [],
    items: []
  };
}

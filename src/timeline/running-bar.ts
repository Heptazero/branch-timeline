import { setIcon } from "obsidian";
import type { TimelineDayState } from "../types";
import { compactDuration, elapsedMinutes, runningItems } from "./timer-service";

export interface RunningBarActions {
  open: (itemId: string) => void;
  distract: (itemId: string) => void;
  stop: (itemId: string) => void;
}

export class RunningBar {
  private title: HTMLElement;
  private duration: HTMLElement;
  private primaryId: string | null = null;

  constructor(private element: HTMLElement, private actions: RunningBarActions) {
    const open = element.createEl("button", { cls: "btl-running-open", attr: { type: "button" } });
    const icon = open.createSpan({ cls: "btl-running-icon" });
    setIcon(icon, "timer");
    this.title = open.createSpan({ cls: "btl-running-title" });
    this.duration = open.createEl("strong", { cls: "btl-running-duration" });
    open.onclick = () => { if (this.primaryId) actions.open(this.primaryId); };
    const distract = element.createEl("button", {
      cls: "btl-running-distract",
      attr: { type: "button", "aria-label": "记录分神", title: "记录分神" }
    });
    distract.onclick = event => {
      event.stopPropagation();
      if (this.primaryId) actions.distract(this.primaryId);
    };
    const stop = element.createEl("button", {
      cls: "btl-running-stop",
      attr: { type: "button", "aria-label": "结束计时", title: "结束计时" }
    });
    setIcon(stop, "square");
    stop.onclick = event => {
      event.stopPropagation();
      if (this.primaryId) actions.stop(this.primaryId);
    };
  }

  update(day: TimelineDayState, nowMinute: number): void {
    const items = runningItems(day);
    const primary = items[0];
    this.primaryId = primary?.id || null;
    this.element.toggleClass("is-hidden", !primary);
    if (!primary) return;
    this.title.setText(`${primary.title}${items.length > 1 ? ` +${items.length - 1}` : ""}`);
    this.duration.setText(compactDuration(elapsedMinutes(primary, day, nowMinute)));
  }

  hide(): void {
    this.primaryId = null;
    this.element.addClass("is-hidden");
  }
}

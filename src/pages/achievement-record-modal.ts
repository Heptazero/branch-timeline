import { App, Modal } from "obsidian";
import type { AchievementRecord } from "../types";
import { pad2 } from "../vault/format";

export interface AchievementRecordDraft {
  date: string;
  minute: number;
  note: string;
}

export class AchievementRecordModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private achievementName: string,
    private resolve: (value: AchievementRecordDraft | null) => void,
    private record?: AchievementRecord
  ) { super(app); }

  onOpen(): void {
    const now = new Date();
    const dateValue = this.record?.date || localDate(now);
    const minuteValue = this.record?.minute ?? now.getHours() * 60 + now.getMinutes();
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal", "btl-achievement-record-modal");
    this.contentEl.createEl("h3", { text: this.record ? "编辑记录" : "添加记录" });
    this.contentEl.createEl("div", { cls: "btl-achievement-record-name", text: this.achievementName });

    const timeRow = this.contentEl.createDiv({ cls: "btl-achievement-record-fields" });
    const dateField = field(timeRow, "日期");
    const dateInput = dateField.createEl("input", {
      attr: { type: "date", value: dateValue, "aria-label": "记录日期" }
    });
    dateInput.value = dateValue;
    const timeField = field(timeRow, "时间");
    const timeInput = timeField.createEl("input", {
      attr: { type: "time", value: minuteText(minuteValue), "aria-label": "记录时间", step: "300" }
    });
    timeInput.value = minuteText(minuteValue);

    const noteField = field(this.contentEl, "备注");
    const note = noteField.createEl("textarea", {
      cls: "btl-textarea",
      attr: { rows: "4", placeholder: "这次发生了什么（可选）", "aria-label": "记录备注" }
    });
    note.value = this.record?.note || "";
    note.onkeydown = event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) this.submit(dateInput, timeInput, note);
    };

    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: this.record ? "保存" : "添加", cls: "mod-cta" })
      .onclick = () => this.submit(dateInput, timeInput, note);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private submit(dateInput: HTMLInputElement, timeInput: HTMLInputElement, note: HTMLTextAreaElement): void {
    const minute = parseMinute(timeInput.value);
    if (!dateInput.value || minute == null) return;
    this.resolved = true;
    this.resolve({ date: dateInput.value, minute, note: note.value.trim() });
    this.close();
  }
}

function field(container: HTMLElement, label: string): HTMLLabelElement {
  const fieldEl = container.createEl("label", { cls: "btl-achievement-record-field" });
  fieldEl.createSpan({ text: label });
  return fieldEl;
}

function parseMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function minuteText(minute: number): string {
  return `${pad2(Math.floor(minute / 60) % 24)}:${pad2(minute % 60)}`;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

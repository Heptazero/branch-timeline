import { App, Modal } from "obsidian";
import type { LifeDatePrecision, LifeEvent } from "../types";
import { lifeDatePosition, lifeDateValue, parseLifeDate } from "./life-model";

export type LifeEventDraft = Omit<LifeEvent, "id">;
type DateInputs = { year: HTMLInputElement; month: HTMLInputElement; day: HTMLInputElement; row: HTMLElement };

export class LifeEventModal extends Modal {
  private resolved = false;

  constructor(app: App, private resolve: (value: LifeEventDraft | null) => void, private original?: LifeEvent, private suggestedDate?: string) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("btl-modal", "btl-life-modal");
    this.contentEl.createEl("h3", { text: this.original ? "编辑人生节点" : "添加人生节点" });
    const title = this.contentEl.createEl("input", {
      cls: "btl-text-input",
      attr: { placeholder: "发生了什么", "aria-label": "节点名称" }
    });
    title.value = this.original?.title || "";
    const kindRow = this.contentEl.createDiv({ cls: "btl-life-segments" });
    let kind: LifeEvent["kind"] = this.original?.kind || "milestone";
    const kindButtons = ([ ["milestone", "节点"], ["chapter", "阶段"] ] as const).map(([value, label]) => {
      const button = kindRow.createEl("button", { text: label, attr: { type: "button" } });
      button.onclick = () => { kind = value; sync(); };
      return { value, button };
    });
    const precisionRow = this.contentEl.createDiv({ cls: "btl-life-segments" });
    let precision: LifeDatePrecision = parseLifeDate(this.original?.date || this.suggestedDate || "")?.precision || "day";
    const precisionButtons = ([ ["year", "年"], ["month", "月"], ["day", "日"] ] as const).map(([value, label]) => {
      const button = precisionRow.createEl("button", { text: label, attr: { type: "button" } });
      button.onclick = () => { precision = value; sync(); };
      return { value, button };
    });
    const start = this.dateInputs("日期", this.original?.date || this.suggestedDate);
    const end = this.dateInputs("结束", this.original?.endDate || this.original?.date || this.suggestedDate);
    const note = this.contentEl.createEl("textarea", {
      cls: "btl-textarea btl-life-note",
      attr: { placeholder: "留一句话（可选）", rows: "3", "aria-label": "备注" }
    });
    note.value = this.original?.note || "";
    const error = this.contentEl.createDiv({ cls: "btl-life-error" });
    const sync = () => {
      for (const { value, button } of kindButtons) {
        button.toggleClass("is-active", value === kind);
        button.setAttr("aria-pressed", String(value === kind));
      }
      for (const { value, button } of precisionButtons) {
        button.toggleClass("is-active", value === precision);
        button.setAttr("aria-pressed", String(value === precision));
      }
      end.row.toggleClass("is-hidden", kind !== "chapter");
      for (const group of [start, end]) {
        group.month.toggleClass("is-hidden", precision === "year");
        group.day.toggleClass("is-hidden", precision !== "day");
      }
      error.setText("");
    };
    sync();
    const actions = this.contentEl.createDiv({ cls: "btl-modal-actions" });
    actions.createEl("button", { text: "取消" }).onclick = () => this.close();
    actions.createEl("button", { text: this.original ? "保存" : "添加", cls: "mod-cta" }).onclick = () => {
      const startDate = this.readDate(start, precision);
      const endDate = kind === "chapter" ? this.readDate(end, precision) : undefined;
      if (!title.value.trim() || !startDate || (kind === "chapter" && (!endDate || lifeDatePosition(endDate, "end") <= lifeDatePosition(startDate, "start")))) {
        error.setText("请填写名称和有效日期；阶段结束须晚于开始。");
        return;
      }
      this.resolved = true;
      this.resolve({ title: title.value.trim(), date: startDate, kind, ...(endDate ? { endDate } : {}), note: note.value.trim() });
      this.close();
    };
    window.setTimeout(() => title.focus(), 30);
  }

  onClose(): void {
    if (!this.resolved) this.resolve(null);
    this.contentEl.empty();
  }

  private dateInputs(label: string, value?: string): DateInputs {
    const now = new Date();
    const parts = parseLifeDate(value || "") || { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    const row = this.contentEl.createDiv({ cls: "btl-life-date-row" });
    row.createSpan({ text: label });
    const year = this.numberInput(row, "年", parts.year, 4);
    const month = this.numberInput(row, "月", parts.month, 2);
    const day = this.numberInput(row, "日", parts.day, 2);
    return { year, month, day, row };
  }

  private numberInput(row: HTMLElement, label: string, value: number, length: number): HTMLInputElement {
    const input = row.createEl("input", {
      attr: { type: "text", inputmode: "numeric", maxlength: String(length), "aria-label": label }
    });
    input.value = String(value).padStart(length, "0");
    return input;
  }

  private readDate(group: DateInputs, precision: LifeDatePrecision): string | null {
    const values = [group.year.value, group.month.value, group.day.value];
    if (values.some(value => !/^\d+$/.test(value))) return null;
    return lifeDateValue(Number(values[0]), Number(values[1]), Number(values[2]), precision);
  }
}

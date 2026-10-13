import { Setting, setIcon } from "obsidian";
import type { MentalStateLabel } from "./types";
import { clampFocusScore } from "./focus-state-model";
import { focusRhythmColor } from "./focus-rhythm-color";

export function renderMentalStateSettings(
  parent: HTMLElement,
  labels: MentalStateLabel[],
  save: () => Promise<void>,
  redisplay: (focusLast?: boolean) => void
): void {
  const list = parent.createDiv({ cls: "btl-mental-state-settings" });
  for (const label of labels) {
    const row = new Setting(list).setClass("btl-mental-state-row");
    row.addText(text => text.setPlaceholder("状态名称").setValue(label.name).onChange(async value => {
      label.name = value.trim().slice(0, 24);
      await save();
    }));
    const slider = row.controlEl.createEl("input", { type: "range", attr: { min: "0", max: "100", step: "5", "aria-label": `${label.name || "状态"}默认脑力` } });
    slider.value = String(label.score);
    const swatch = row.controlEl.createSpan({ cls: "btl-mental-state-swatch", attr: { title: String(label.score) } });
    const paint = () => { swatch.style.background = focusRhythmColor(Number(slider.value) / 100); swatch.title = `${slider.value}/100`; };
    paint();
    slider.oninput = paint;
    slider.onchange = async () => { label.score = clampFocusScore(Number(slider.value)); await save(); };
    const remove = row.controlEl.createEl("button", { cls: "btl-mental-state-remove", attr: { type: "button", "aria-label": `删除${label.name}`, title: `删除${label.name}` } });
    setIcon(remove, "trash-2");
    remove.onclick = async () => { labels.splice(labels.indexOf(label), 1); await save(); redisplay(); };
  }
  const add = parent.createEl("button", { cls: "btl-mental-state-add", attr: { type: "button" } });
  setIcon(add.createSpan(), "plus");
  add.createSpan({ text: "添加状态" });
  add.onclick = async () => {
    labels.push({ id: `state-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "新状态", score: 50 });
    await save();
    redisplay(true);
  };
}

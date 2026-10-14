import { Setting } from "obsidian";
import { applyFocusColors } from "./focus-rhythm-color";
import type { FocusColors } from "./types";

export function renderFocusColorSettings(parent: HTMLElement, colors: FocusColors, save: () => Promise<void>): void {
  const controls = parent.createDiv({ cls: "btl-focus-colors" });
  applyFocusColors(parent, colors);
  for (const [key, label] of [["low", "难以投入"], ["neutral", "中性"], ["high", "高度专注"]] as const) {
    const row = new Setting(controls).setName(label).setClass("btl-focus-color-row");
    row.addColorPicker(picker => picker.setValue(colors[key]).onChange(async value => {
      colors[key] = value;
      applyFocusColors(parent, colors);
      await save();
    }));
  }
}

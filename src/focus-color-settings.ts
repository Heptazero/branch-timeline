import { openColorPopover } from "./color-popover";
import { applyFocusColors } from "./focus-rhythm-color";
import type { FocusColors } from "./types";

const OPTIONS: Record<keyof FocusColors, readonly string[]> = {
  low: ["#d84b4b", "#f04452", "#e95b35", "#bd3d76", "#aa3948"],
  neutral: ["#8b929d", "#697586", "#a2a7b0", "#7f8b95", "#737a84"],
  high: ["#126cff", "#006dff", "#008fff", "#3d83d9", "#3458ff", "#1387d6"]
};

export function renderFocusColorSettings(parent: HTMLElement, colors: FocusColors, save: () => Promise<void>): void {
  const controls = parent.createDiv({ cls: "btl-focus-colors" });
  applyFocusColors(parent, colors);
  for (const [key, label] of [["low", "难以投入"], ["neutral", "中性"], ["high", "高度专注"]] as const) {
    const row = controls.createDiv({ cls: "btl-focus-color-row" });
    row.createSpan({ text: label });
    const swatch = row.createEl("button", { cls: "btl-focus-color-swatch", attr: { type: "button", "aria-label": `选择${label}颜色`, title: `选择${label}颜色` } });
    const hex = row.createEl("input", { type: "text", attr: { "aria-label": `${label}颜色代码`, maxlength: "7", spellcheck: "false" } });
    const paint = () => { swatch.style.background = colors[key]; hex.value = colors[key]; applyFocusColors(parent, colors); };
    const choose = async (color: string) => { colors[key] = color; paint(); await save(); };
    paint();
    swatch.onclick = () => openColorPopover(swatch, OPTIONS[key].map(color => ({ id: color, color, label: color })), colors[key], choose);
    hex.onchange = () => {
      const value = hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(value)) void choose(value.toLowerCase());
      else paint();
    };
  }
}

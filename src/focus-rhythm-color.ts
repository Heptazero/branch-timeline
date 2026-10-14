import type { FocusColors } from "./types";

export const DEFAULT_FOCUS_COLORS: FocusColors = { low: "#d84b4b", neutral: "#8b929d", high: "#126cff" };

export function normalizeFocusColors(value: unknown): FocusColors {
  const input = value && typeof value === "object" ? value as Partial<FocusColors> : {};
  const valid = (color: unknown, fallback: string) =>
    typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  return {
    low: valid(input.low, DEFAULT_FOCUS_COLORS.low),
    neutral: valid(input.neutral, DEFAULT_FOCUS_COLORS.neutral),
    high: valid(input.high, DEFAULT_FOCUS_COLORS.high)
  };
}

export function applyFocusColors(element: HTMLElement, colors: FocusColors): void {
  for (const key of Object.keys(DEFAULT_FOCUS_COLORS) as Array<keyof FocusColors>) {
    element.style.setProperty(`--btl-focus-${key}`, colors[key]);
  }
}

/** 0=难以投入，0.5=中性，1=高度清醒专注。 */
export function focusRhythmColor(score: number): string {
  const value = Math.max(0, Math.min(1, score));
  if (value <= .5) return `color-mix(in srgb, var(--btl-focus-neutral, ${DEFAULT_FOCUS_COLORS.neutral}) ${Math.round(value * 200)}%, var(--btl-focus-low, ${DEFAULT_FOCUS_COLORS.low}))`;
  return `color-mix(in srgb, var(--btl-focus-high, ${DEFAULT_FOCUS_COLORS.high}) ${Math.round((value - .5) * 200)}%, var(--btl-focus-neutral, ${DEFAULT_FOCUS_COLORS.neutral}))`;
}

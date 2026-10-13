/** 0=难以投入，0.5=中性，1=高度清醒专注。 */
export function focusRhythmColor(score: number): string {
  const value = Math.max(0, Math.min(1, score));
  if (value <= .5) return `color-mix(in srgb, #8b929d ${Math.round(value * 200)}%, #d84b4b)`;
  return `color-mix(in srgb, #244fa6 ${Math.round((value - .5) * 200)}%, #8b929d)`;
}

/** 蓝色表示记录到顺畅，红色表示记录到走神；没有记录时不着色。 */
export function focusRhythmColor(score: number): string {
  const blue = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return `color-mix(in srgb, #244fa6 ${blue}%, #d84b4b)`;
}

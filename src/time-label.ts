export function hoursValue(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const digits = safe > 0 && safe < 6 ? 2 : 1;
  return Number((safe / 60).toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

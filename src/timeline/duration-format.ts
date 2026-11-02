/** Round labels only; saved start/end values keep their second precision. */
function parts(minutes: number) {
  const seconds = Math.max(0, Math.round((Number.isFinite(minutes) ? minutes : 0) * 60));
  const whole = Math.round(seconds / 60);
  return { seconds, whole, hours: Math.floor(whole / 60), rest: whole % 60 };
}
export function durationLabel(minutes: number): string {
  const value = parts(minutes);
  if (value.seconds > 0 && value.seconds < 60) return `${value.seconds} 秒`;
  if (value.whole < 60) return `${value.whole} 分钟`;
  return `${(value.whole / 60).toFixed(value.rest ? 1 : 0)} 小时`;
}
export function compactDuration(minutes: number): string {
  const value = parts(minutes);
  if (value.seconds > 0 && value.seconds < 60) return `${value.seconds}s`;
  if (value.whole < 60) return `${value.whole}m`;
  return `${value.hours}h${value.rest ? `${value.rest}m` : ""}`;
}
export function readableDuration(minutes: number): string {
  const value = parts(minutes);
  if (value.seconds > 0 && value.seconds < 60) return `${value.seconds}秒`;
  if (value.whole < 60) return `${value.whole}分钟`;
  return `${value.hours}小时${value.rest ? `${value.rest}分钟` : ""}`;
}
export function gapDurationLabel(minutes: number): string { return `未记录 ${compactDuration(minutes)}`; }
export function shortDurationLabel(minutes: number): string {
  return durationLabel(minutes).replace(" 小时", "h").replace(" 分钟", "m").replace(" 秒", "s");
}

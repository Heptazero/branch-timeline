export const PROJECT_TOP = 52;
export const PROJECT_SCALE_MIN = 0.8;
export const PROJECT_SCALE_MAX = 900;

export function applyProjectLod(canvas: HTMLElement, scale: number): void {
  const detail = smoothstep(24, 220, scale);
  const text = smoothstep(38, 150, scale);
  canvas.style.setProperty("--btl-project-card-width", `${lerp(10, 138, detail)}px`);
  canvas.style.setProperty("--btl-project-card-radius", `${lerp(999, 9, detail)}px`);
  canvas.style.setProperty("--btl-project-card-padding-x", `${lerp(1, 9, detail)}px`);
  canvas.style.setProperty("--btl-project-card-padding-y", `${lerp(1, 6, detail)}px`);
  canvas.style.setProperty("--btl-project-title-opacity", String(text));
  canvas.style.setProperty("--btl-project-meta-opacity", String(smoothstep(95, 260, scale)));
  canvas.style.setProperty("--btl-project-compact-opacity", String(1 - text));
}

export function projectBranchPath(center: number, x: number, startY: number, endY: number, merged: boolean): string {
  const bend = Math.min(30, Math.max(12, (endY - startY) / 2));
  let path = `M ${center} ${startY} Q ${x} ${startY} ${x} ${startY + bend} L ${x} ${endY}`;
  if (merged) path += ` Q ${x} ${endY + 26} ${center} ${endY + 26}`;
  return path;
}

export function clampProjectScale(value: number): number {
  return Math.max(PROJECT_SCALE_MIN, Math.min(PROJECT_SCALE_MAX, value));
}

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

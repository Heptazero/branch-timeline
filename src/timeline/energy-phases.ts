import type { TimelineDayState, TimelineEnergyPhase } from "../types";

export const ENERGY_PHASE_COLORS = [
  { id: "#3978d3", label: "蓝色" },
  { id: "#8a94a2", label: "灰色" }
] as const;

export function normalizeEnergyPhases(value: unknown): TimelineEnergyPhase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const phase = candidate as Partial<TimelineEnergyPhase>;
    if (!Number.isFinite(phase.at)) return [];
    return [{
      id: phase.id || `energy-legacy-${index}`,
      name: phase.name?.trim() || `精力 ${index + 1}`,
      at: Number(phase.at),
      color: phase.color || ENERGY_PHASE_COLORS[index % ENERGY_PHASE_COLORS.length].id,
      side: phase.side === -1 ? -1 as const : 1 as const
    }];
  }).sort((a, b) => a.at - b.at);
}

export function effectiveEnergyPhases(
  days: Readonly<Record<string, TimelineDayState>>,
  date: string
): TimelineEnergyPhase[] {
  const current = days[date];
  if (Array.isArray(current?.energyPhases)) return normalizeEnergyPhases(current.energyPhases);
  const previousDate = Object.keys(days)
    .filter(key => key < date && Array.isArray(days[key]?.energyPhases))
    .sort((a, b) => b.localeCompare(a))[0];
  return previousDate ? normalizeEnergyPhases(days[previousDate].energyPhases) : [];
}

export function materializeEnergyPhases(
  days: Record<string, TimelineDayState>,
  date: string,
  day: TimelineDayState
): TimelineEnergyPhase[] {
  if (!Array.isArray(day.energyPhases)) {
    day.energyPhases = effectiveEnergyPhases(days, date).map(phase => ({ ...phase }));
  }
  return day.energyPhases;
}

export function energyPhaseBounds(
  phases: readonly TimelineEnergyPhase[],
  phaseId: string,
  wake: number,
  sleep: number,
  minimumGap = 5
): [number, number] {
  const ordered = [...phases].sort((a, b) => a.at - b.at);
  const index = ordered.findIndex(phase => phase.id === phaseId);
  if (index < 0) return [wake, sleep];
  return [
    index > 0 ? ordered[index - 1].at + minimumGap : wake,
    index < ordered.length - 1 ? ordered[index + 1].at - minimumGap : sleep
  ];
}

export function roundToQuarter(hours: number): number {
  return Math.round(hours * 4) / 4;
}

export function enforceMinHours(hours: number, min: number): number {
  return Math.max(min, roundToQuarter(hours));
}

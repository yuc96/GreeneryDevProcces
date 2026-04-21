import type { PricingEngineConfig } from "@/server/pricing/engine-schema";

type MarkupRangeCfg = Pick<
  PricingEngineConfig,
  "markupMin" | "markupMax" | "markupStep"
>;

/** Values shown in markup `<select>`s: from min to max inclusive by step. */
export function markupSelectValues(cfg: MarkupRangeCfg): number[] {
  const min = cfg.markupMin;
  const max = cfg.markupMax;
  const step = cfg.markupStep;
  if (
    !(step > 0) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max < min
  ) {
    return [2.5];
  }
  const nSteps = Math.round((max - min) / step);
  if (nSteps < 0) return [min];
  const vals: number[] = [];
  for (let i = 0; i <= nSteps; i++) {
    vals.push(Math.round((min + i * step) * 100) / 100);
  }
  return vals;
}

/** Select options including `current` when it falls outside the ladder (legacy rows). */
export function markupOptionsForSelect(
  cfg: MarkupRangeCfg,
  current?: number,
): number[] {
  const base = markupSelectValues(cfg);
  if (
    typeof current === "number" &&
    Number.isFinite(current) &&
    !base.some((x) => Math.abs(x - current) < 1e-6)
  ) {
    return [...base, current].sort((a, b) => a - b);
  }
  return base;
}

/** Snap a value onto the pricing ladder (min..max by step), for legacy markup values. */
export function snapMarkupToPricingLadder(
  value: number,
  cfg: MarkupRangeCfg,
): number {
  const min = cfg.markupMin;
  const max = cfg.markupMax;
  const step = cfg.markupStep;
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return 2.5;
  }
  const v = Number.isFinite(value) ? value : min;
  const clamped = Math.min(max, Math.max(min, v));
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  return Math.round(Math.min(max, Math.max(min, snapped)) * 100) / 100;
}

import type { LaborPlantSize } from "../labor-engine-schema";

const ORDER_INCHES = [4, 6, 8, 12, 14, 17, 21, 24] as const;

const INCH_TO_LABEL: Record<number, LaborPlantSize> = {
  4: `4"`,
  6: `6"`,
  8: `8"`,
  12: `12"`,
  14: `14"`,
  17: `17"`,
  21: `21"`,
  24: `24"`,
};

export function inchesToLaborPlantSize(
  inches: number | null | undefined,
  fallback: LaborPlantSize,
): { size: LaborPlantSize; usedFallback: boolean } {
  if (typeof inches !== "number" || !Number.isFinite(inches) || inches <= 0) {
    return { size: fallback, usedFallback: true };
  }
  let best: (typeof ORDER_INCHES)[number] = ORDER_INCHES[0];
  let bestDist = Math.abs(inches - best);
  for (const n of ORDER_INCHES) {
    const d = Math.abs(inches - n);
    if (d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return { size: INCH_TO_LABEL[best], usedFallback: false };
}

export function laborSizeToInches(size: LaborPlantSize): number {
  const m = /^(\d+)/.exec(size);
  return m ? Number(m[1]) : 6;
}

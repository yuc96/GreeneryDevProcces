import type { LaborEngineConfig } from "../labor-engine-schema";
import { inchesToLaborPlantSize } from "./sizes";

/**
 * Install workload in one-person minutes for a plant line (pricing / maintenance).
 */
export function installOnePersonMinutesForPlantUnits(
  qty: number,
  sizeInches: number | null | undefined,
  plantName: string | undefined,
  parseSizeInchesFromText: (t: string) => number | null,
  laborCfg: LaborEngineConfig,
): number {
  const inches =
    typeof sizeInches === "number" && Number.isFinite(sizeInches)
      ? sizeInches
      : plantName
        ? parseSizeInchesFromText(plantName)
        : null;
  const { size } = inchesToLaborPlantSize(
    inches,
    laborCfg.simplifiedFallbackPlantSize,
  );
  const q = Math.max(0, Number(qty) || 0);
  return q * laborCfg.INSTALL_MINUTES_PER_PLANT[size];
}

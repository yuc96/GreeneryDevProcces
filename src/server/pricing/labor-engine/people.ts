import type { LaborEngineConfig, LaborPlantSize } from "../labor-engine-schema";
import type { PlantQtyRow } from "./pwu";

function sumQtyBySizes(
  plants: PlantQtyRow[],
  sizes: LaborPlantSize[],
): number {
  const set = new Set(sizes);
  let n = 0;
  for (const p of plants) {
    if (!set.has(p.size)) continue;
    n += Math.max(0, p.quantity);
  }
  return n;
}

function sumQtyBySize(plants: PlantQtyRow[], size: LaborPlantSize): number {
  return sumQtyBySizes(plants, [size]);
}

export type PeopleRuleId =
  | "plants_17_or_larger"
  | "total_14_over_threshold"
  | "total_12_over_threshold"
  | "total_6_8_over_threshold"
  | "default_1_person";

export function determinePeopleForInstall(
  plants: PlantQtyRow[],
  cfg: LaborEngineConfig,
): { people: number; ruleMatched: PeopleRuleId } {
  const rules = cfg.PEOPLE_RULES;
  const large = new Set(rules.largeSizesRequireTwo);
  const hasLarge = plants.some(
    (p) => large.has(p.size) && Math.max(0, p.quantity) > 0,
  );
  if (hasLarge) {
    return {
      people: Math.min(cfg.MAX_PEOPLE, 2),
      ruleMatched: "plants_17_or_larger",
    };
  }

  if (sumQtyBySize(plants, `14"`) > rules.threshold14Inch) {
    return {
      people: Math.min(cfg.MAX_PEOPLE, 2),
      ruleMatched: "total_14_over_threshold",
    };
  }

  if (sumQtyBySize(plants, `12"`) > rules.threshold12Inch) {
    return {
      people: Math.min(cfg.MAX_PEOPLE, 2),
      ruleMatched: "total_12_over_threshold",
    };
  }

  const qtySmall =
    sumQtyBySize(plants, `6"`) + sumQtyBySize(plants, `8"`);
  if (qtySmall > rules.thresholdSmallPlants) {
    return {
      people: Math.min(cfg.MAX_PEOPLE, 2),
      ruleMatched: "total_6_8_over_threshold",
    };
  }

  return { people: 1, ruleMatched: "default_1_person" };
}

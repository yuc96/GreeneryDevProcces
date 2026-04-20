import type {
  ComplexityBand,
  PlantEnvironment,
  PricingEngineConfig,
  StagingRecipe,
} from "./engine-schema";

/**
 * Resolve which complexity band an inches value belongs to. Falls back to
 * the "medium" band (or the middle of the list) when inches is null/NaN.
 *
 * Exposed so the staging engine and the labor engine agree on the same band.
 */
export function bandForInches(
  bands: ComplexityBand[],
  inches: number | null | undefined,
): ComplexityBand {
  if (inches == null || !Number.isFinite(inches)) {
    return (
      bands.find((b) => b.id === "medium") ??
      bands[Math.min(1, bands.length - 1)] ??
      bands[0]
    );
  }
  for (const b of bands) {
    const low = b.minInches == null ? -Infinity : b.minInches;
    const high = b.maxInches == null ? Infinity : b.maxInches;
    if (inches >= low && inches <= high) return b;
  }
  return bands[bands.length - 1];
}

/** Looks up the recipe for a (band, environment). May return null when none. */
export function findStagingRecipe(
  recipes: StagingRecipe[],
  bandId: string,
  environment: PlantEnvironment,
): StagingRecipe | null {
  return (
    recipes.find(
      (r) => r.bandId === bandId && r.environment === environment,
    ) ?? null
  );
}

export interface StagingMaterialRef {
  /** Stable id from `staggings-list.json`. */
  sourceId: number;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Cheapest provider price (the wholesale unit cost). */
  unitWholesale: number;
  vendorName: string;
}

export interface AutoStagingComponentResult {
  materialSourceId: number;
  materialName: string;
  /** Cheapest provider used for cost (wholesale per unit). */
  unitWholesale: number;
  vendorName: string;
  /** qtyPerPlant × plantQty, rounded UP (you cannot buy half a bag). */
  units: number;
  /** units × unitWholesale (wholesale, before markup/freight). */
  wholesaleCost: number;
  note?: string;
}

export interface AutoStagingForPlantInput {
  /** Identifier of the plant line (so resulting staging items can be linked). */
  plantLineId: string;
  plantName: string;
  qty: number;
  potSizeInches: number | null | undefined;
  environment: PlantEnvironment;
}

export interface AutoStagingForPlantResult {
  plantLineId: string;
  plantName: string;
  qty: number;
  bandId: string;
  bandLabel: string;
  environment: PlantEnvironment;
  recipeId: string | null;
  components: AutoStagingComponentResult[];
  totalWholesaleCost: number;
}

/**
 * Compute the auto-staging breakdown for a single plant line.
 *
 * Formula per material in the recipe:
 *   units = ceil(qtyPerPlant × plantQty)
 *   cost  = units × unitWholesale   (cheapest provider)
 *
 * Rounding ceil ensures we always provision enough material when, e.g., a
 * recipe says "0.5 bag per plant" and the line has 3 plants -> 2 bags.
 */
export function computeAutoStagingForPlant(
  input: AutoStagingForPlantInput,
  config: PricingEngineConfig,
  materials: Map<number, StagingMaterialRef>,
): AutoStagingForPlantResult {
  const band = bandForInches(
    config.laborAuto.complexityBands,
    input.potSizeInches ?? null,
  );
  const recipe = findStagingRecipe(
    config.stagingRecipes,
    band.id,
    input.environment,
  );
  const qty = Math.max(0, Number(input.qty) || 0);

  const components: AutoStagingComponentResult[] = [];
  if (recipe && qty > 0) {
    for (const c of recipe.components) {
      const mat = materials.get(c.materialSourceId);
      if (!mat) continue;
      const units = Math.max(0, Math.ceil(c.qtyPerPlant * qty));
      if (units <= 0) continue;
      const cost = round2(units * mat.unitWholesale);
      components.push({
        materialSourceId: c.materialSourceId,
        materialName: mat.name,
        unitWholesale: mat.unitWholesale,
        vendorName: mat.vendorName,
        units,
        wholesaleCost: cost,
        note: c.note,
      });
    }
  }

  return {
    plantLineId: input.plantLineId,
    plantName: input.plantName,
    qty,
    bandId: band.id,
    bandLabel: band.label,
    environment: input.environment,
    recipeId: recipe?.id ?? null,
    components,
    totalWholesaleCost: round2(
      components.reduce((s, c) => s + c.wholesaleCost, 0),
    ),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

import type { PotCatalogEntry, PlantCatalogEntry } from "@/lib/types";

/**
 * Standard inches range for each complexity band. Mirrors the default
 * `complexityBands` in the pricing engine so the pot picker, the staging
 * engine and the labor engine all agree on what "Medium", "Large", etc. mean.
 */
export interface SizeBandRange {
  id: string;
  label: string;
  /** Inclusive lower bound; null = open. */
  min: number | null;
  /** Inclusive upper bound; null = open. */
  max: number | null;
}

export const DEFAULT_SIZE_BANDS: SizeBandRange[] = [
  { id: "small", label: "Small", min: null, max: 8 },
  { id: "medium", label: "Medium", min: 9, max: 14 },
  { id: "large", label: "Large", min: 15, max: 20 },
  { id: "xl", label: "Extra large", min: 21, max: null },
];

/** Returns the band a number of inches falls into, or null if inches is null. */
export function bandForInches(
  bands: SizeBandRange[],
  inches: number | null | undefined,
): SizeBandRange | null {
  if (inches == null || !Number.isFinite(inches)) return null;
  for (const b of bands) {
    const lo = b.min ?? -Infinity;
    const hi = b.max ?? Infinity;
    if (inches >= lo && inches <= hi) return b;
  }
  return null;
}

/**
 * Strict filter: returns only pots whose `sizeInches` falls in the SAME band
 * as the plant size. Use this for the default "matching pots only" view of
 * the picker. Pots without a numeric size are excluded.
 */
export function potsInSameBandAs(
  pots: PotCatalogEntry[],
  plantSizeInches: number | null | undefined,
  bands: SizeBandRange[] = DEFAULT_SIZE_BANDS,
): PotCatalogEntry[] {
  const band = bandForInches(bands, plantSizeInches);
  if (!band) return [];
  return pots
    .filter((p) => {
      if (typeof p.sizeInches !== "number") return false;
      const lo = band.min ?? -Infinity;
      const hi = band.max ?? Infinity;
      return p.sizeInches >= lo && p.sizeInches <= hi;
    })
    .sort((a, b) => {
      const da = Math.abs((a.sizeInches ?? 0) - (plantSizeInches ?? 0));
      const db = Math.abs((b.sizeInches ?? 0) - (plantSizeInches ?? 0));
      if (da !== db) return da - db;
      return (a.wholesalePrice ?? 0) - (b.wholesalePrice ?? 0);
    });
}

/**
 * Returns the pot catalog entries that are compatible with a plant of a given
 * pot-diameter-in-inches, sorted by "best fit" (closest size band) then by
 * wholesale price (cheapest first).
 *
 * Rule of thumb (configurable via `sizeSlackInches`):
 *   compatible pots have `sizeInches` within ±sizeSlackInches of the plant size.
 * If nothing matches, we fall back to pots that are at least as large as the plant.
 */
export function matchPotsForPlantSize(
  pots: PotCatalogEntry[],
  plantSizeInches: number | null | undefined,
  opts: { sizeSlackInches?: number; kinds?: string[] } = {},
): PotCatalogEntry[] {
  const slack = opts.sizeSlackInches ?? 2;
  const kinds = opts.kinds;
  const pool = kinds ? pots.filter((p) => kinds.includes(p.kind ?? "")) : pots;

  if (plantSizeInches == null) {
    return [...pool].sort(
      (a, b) => (a.wholesalePrice ?? 0) - (b.wholesalePrice ?? 0),
    );
  }

  const within = pool.filter(
    (p) =>
      typeof p.sizeInches === "number" &&
      Math.abs((p.sizeInches ?? 0) - plantSizeInches) <= slack,
  );
  if (within.length > 0) {
    return within.sort((a, b) => {
      const da = Math.abs((a.sizeInches ?? 0) - plantSizeInches);
      const db = Math.abs((b.sizeInches ?? 0) - plantSizeInches);
      if (da !== db) return da - db;
      return (a.wholesalePrice ?? 0) - (b.wholesalePrice ?? 0);
    });
  }

  const larger = pool.filter(
    (p) => typeof p.sizeInches === "number" && (p.sizeInches ?? 0) >= plantSizeInches,
  );
  if (larger.length > 0) {
    return larger.sort((a, b) => {
      const aa = a.sizeInches ?? Infinity;
      const bb = b.sizeInches ?? Infinity;
      if (aa !== bb) return aa - bb;
      return (a.wholesalePrice ?? 0) - (b.wholesalePrice ?? 0);
    });
  }

  return [...pool].sort(
    (a, b) => (b.sizeInches ?? 0) - (a.sizeInches ?? 0),
  );
}

/** Shortcut: best pick for a plant, or undefined if no pots are available. */
export function bestPotForPlant(
  pots: PotCatalogEntry[],
  plant: PlantCatalogEntry,
  opts?: Parameters<typeof matchPotsForPlantSize>[2],
): PotCatalogEntry | undefined {
  return matchPotsForPlantSize(pots, plant.sizeInches ?? null, opts)[0];
}

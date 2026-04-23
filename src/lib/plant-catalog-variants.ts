import type { PlantCatalogEntry } from "@/lib/types";
import { CANONICAL_POT_SIZES_INCHES } from "@/domain/catalog/canonical-sizes";

export { CANONICAL_POT_SIZES_INCHES };

/** While the user chose a species but not yet a pot size (not persisted as a real catalog row). */
export const PLANT_SPECIES_PENDING_PREFIX = "species-pending:";

export function buildSpeciesPendingCatalogId(catalogCode: string): string {
  return `${PLANT_SPECIES_PENDING_PREFIX}${encodeURIComponent(catalogCode.trim())}`;
}

export function parseSpeciesPendingCatalogId(id: string): string | null {
  const t = id.trim();
  if (!t.startsWith(PLANT_SPECIES_PENDING_PREFIX)) return null;
  try {
    return decodeURIComponent(
      t.slice(PLANT_SPECIES_PENDING_PREFIX.length),
    ).trim();
  } catch {
    return null;
  }
}

/** Full variant id as returned by `/api/catalog/plants` (Mongo seed). */
export function buildPlantVariantCatalogId(
  catalogCode: string,
  sizeInches: number,
): string {
  return `plant-${String(catalogCode).toLowerCase()}-${sizeInches}`;
}

export function parsePlantVariantCatalogId(
  id: string,
): { catalogLower: string; sizeInches: number } | null {
  const t = id.trim();
  if (t.startsWith(PLANT_SPECIES_PENDING_PREFIX)) return null;
  const m = /^plant-(.+)-(\d+)$/u.exec(t);
  if (!m) return null;
  const sizeInches = Number(m[2]);
  if (!Number.isFinite(sizeInches)) return null;
  return { catalogLower: m[1], sizeInches };
}

function catalogRowForPlantId(
  catalog: readonly PlantCatalogEntry[],
  plantCatalogId: string,
): PlantCatalogEntry | undefined {
  const id = plantCatalogId.trim();
  if (!id || !catalog.length) return undefined;
  return catalog.find((p) => p.id === id);
}

/**
 * True when the user finished species + size for a requirement line.
 * Supports Mongo variant ids (`plant-code-10`) and legacy/static ids (`plant-code`)
 * when `catalog` contains a matching row with a known size.
 */
export function isPlantCatalogSelectionComplete(
  plantCatalogId: string,
  catalog?: readonly PlantCatalogEntry[],
): boolean {
  const id = plantCatalogId.trim();
  if (!id) return false;
  if (id.startsWith(PLANT_SPECIES_PENDING_PREFIX)) return false;
  if (parsePlantVariantCatalogId(id) !== null) return true;
  const row = catalog?.length
    ? catalogRowForPlantId(catalog, id)
    : undefined;
  return Boolean(
    row?.catalogCode?.trim() &&
      typeof row.sizeInches === "number" &&
      row.sizeInches > 0,
  );
}

export function uniquePlantSpeciesRows(
  catalog: PlantCatalogEntry[],
): PlantCatalogEntry[] {
  const byCode = new Map<string, PlantCatalogEntry>();
  for (const p of catalog) {
    const code = p.catalogCode?.trim();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, p);
  }
  return [...byCode.values()].sort((a, b) =>
    (a.commonName || a.name).localeCompare(b.commonName || b.name, undefined, {
      sensitivity: "base",
    }),
  );
}

export function findPlantCatalogVariant(
  catalog: PlantCatalogEntry[],
  catalogCode: string,
  sizeInches: number,
): PlantCatalogEntry | undefined {
  const want = catalogCode.trim().toLowerCase();
  return catalog.find(
    (p) =>
      p.catalogCode?.trim().toLowerCase() === want &&
      p.sizeInches === sizeInches,
  );
}

export function deriveSpeciesCodeAndSize(
  catalog: PlantCatalogEntry[],
  plantCatalogId: string,
): { speciesCode: string; sizeStr: string } {
  const pending = parseSpeciesPendingCatalogId(plantCatalogId);
  if (pending) return { speciesCode: pending, sizeStr: "" };

  const direct = catalogRowForPlantId(catalog, plantCatalogId);
  if (direct?.catalogCode?.trim()) {
    const inches = direct.sizeInches;
    return {
      speciesCode: direct.catalogCode.trim(),
      sizeStr:
        typeof inches === "number" && inches > 0 ? String(inches) : "",
    };
  }

  const v = parsePlantVariantCatalogId(plantCatalogId);
  if (!v) return { speciesCode: "", sizeStr: "" };
  const row = catalog.find(
    (p) =>
      p.catalogCode?.toLowerCase() === v.catalogLower &&
      p.sizeInches === v.sizeInches,
  );
  if (row?.catalogCode?.trim()) {
    return {
      speciesCode: row.catalogCode.trim(),
      sizeStr: String(v.sizeInches),
    };
  }
  const anySameCode = catalog.find(
    (p) => p.catalogCode?.trim().toLowerCase() === v.catalogLower,
  );
  return {
    speciesCode: anySameCode?.catalogCode?.trim() ?? v.catalogLower,
    sizeStr: String(v.sizeInches),
  };
}

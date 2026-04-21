import type { LaborMaterialType } from "../labor-engine-schema";

/**
 * Maps staging catalog `sourceId` (staggings-list.json) to labor bulk types.
 * 8 (Peanut shell) → soft_foam (light volumetric filler).
 */
export function laborMaterialTypeFromStagingSourceId(
  sourceId: number,
): LaborMaterialType {
  switch (sourceId) {
    case 1:
      return "hard_foam";
    case 2:
      return "soft_foam";
    case 3:
    case 4:
      return "moss";
    case 5:
      return "dirt";
    case 6:
    case 7:
      return "mulch";
    case 8:
      return "soft_foam";
    default:
      return "dirt";
  }
}

/** Parse `staging-auto-<plantKey>-<materialSourceId>` (plantKey may contain `-`). */
export function parseStagingAutoSourceId(catalogId: string): number | null {
  if (!catalogId.startsWith("staging-auto-")) return null;
  const rest = catalogId.slice("staging-auto-".length);
  const last = rest.lastIndexOf("-");
  if (last <= 0) return null;
  const sourcePart = rest.slice(last + 1);
  const sourceId = Number(sourcePart);
  return Number.isFinite(sourceId) ? sourceId : null;
}

/** `staging-json-<n>` uses numeric catalog id as source id. */
export function parseStagingJsonSourceId(catalogId: string): number | null {
  const m = /^staging-json-(\d+)$/.exec(catalogId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function stagingSourceIdFromCatalogId(catalogId: string): number | null {
  return (
    parseStagingAutoSourceId(catalogId) ?? parseStagingJsonSourceId(catalogId)
  );
}

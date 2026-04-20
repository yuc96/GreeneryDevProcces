import stagingsData from "@/data/staggings-list.json";

export interface StagingProviderOption {
  name: string;
  price: number;
}

/** Preset for staging lines (JSON catalog + user-saved rows). */
export interface StagingLibraryItem {
  id: string;
  label: string;
  wholesaleCost: number;
  markup: number;
  description?: string;
  imageUrl?: string;
  providers?: StagingProviderOption[];
  /** Set when row comes from `staggings-list.json`. */
  sourceId?: number;
}

function cheapestProvider(
  providers: StagingProviderOption[],
): StagingProviderOption {
  return providers.reduce((a, b) => (a.price <= b.price ? a : b));
}

/** Default markup for catalog staging lines (must exist in MARKUPS in wizard). */
export const STAGING_CATALOG_DEFAULT_MARKUP = 1.75;

/**
 * Builds library rows from `src/data/staggings-list.json` (images + provider prices).
 */
export function buildStagingLibraryFromJson(): StagingLibraryItem[] {
  return stagingsData.stagings.map((s) => {
    const cheapest = cheapestProvider(s.providers);
    return {
      id: `staging-cat-${s.id}`,
      label: `${s.name} — ${s.description}`,
      wholesaleCost: cheapest.price,
      markup: STAGING_CATALOG_DEFAULT_MARKUP,
      description: s.description,
      imageUrl: s.image,
      providers: s.providers,
      sourceId: s.id,
    };
  });
}

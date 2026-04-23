import stagingsData from "@/data/staggings-list.json";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "@/server/pricing/engine-schema";

export interface StagingProviderOption {
  name: string;
  price: number;
  address?: string;
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

/** Cheapest provider row (used by Mongo catalog reader and JSON builder). */
export function cheapestStagingProvider(
  providers: StagingProviderOption[],
): StagingProviderOption {
  return providers.reduce((a, b) => (a.price <= b.price ? a : b));
}

const PROVIDER_ADDRESS_BY_NAME: Record<string, string> = {
  "Home Depot":
    "6130 E Colonial Dr, Orlando, FL 32807, Estados Unidos",
  "Lowe's": "3500 S Orange Blossom Trl, Orlando, FL 32839",
};

/**
 * Builds library rows from `src/data/staggings-list.json` (images + provider prices).
 */
export function buildStagingLibraryFromJson(): StagingLibraryItem[] {
  return stagingsData.stagings.map((s) => {
    const cheapest = cheapestStagingProvider(s.providers);
    return {
      id: `staging-cat-${s.id}`,
      label: `${s.name} — ${s.description}`,
      wholesaleCost: cheapest.price,
      markup: DEFAULT_PRICING_ENGINE_CONFIG.defaultMarkup,
      description: s.description,
      imageUrl: s.image,
      providers: s.providers.map((p) => ({
        ...p,
        address: PROVIDER_ADDRESS_BY_NAME[p.name] ?? "Orlando, FL",
      })),
      sourceId: s.id,
    };
  });
}

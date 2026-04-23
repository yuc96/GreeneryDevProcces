import potsCatalogJson from "@/data/pots-catalog.json";
import { buildPlantCatalogDocuments } from "@/infrastructure/seed/plant-catalog-builder";

export interface GrowerOption {
  id: string;
  name: string;
  price: number;
  address: string;
}

export interface PlantCatalogEntry {
  id: string;
  name: string;
  commonName?: string;
  scientificName?: string;
  size: string;
  sizeInches?: number | null;
  searchKey?: string;
  imagePublicPath?: string | null;
  catalogCode?: string;
  requiresRotation: boolean;
  growers: GrowerOption[];
}

/**
 * Business reference for nearby suppliers:
 * keep grower/supplier addresses in Central Florida (<= 80km target radius).
 */

function buildSearchKey(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Same shape as Mongo `readPlantCatalogEntries`: one API row per species × canonical size. */
function buildFlatPlantCatalogFromReference(): PlantCatalogEntry[] {
  const out: PlantCatalogEntry[] = [];
  for (const doc of buildPlantCatalogDocuments()) {
    const code = doc.catalogCode;
    for (const v of doc.variants) {
      out.push({
        id: `plant-${code.toLowerCase()}-${v.sizeInches}`,
        name: doc.commonName,
        commonName: doc.commonName,
        scientificName: doc.scientificName,
        size: `${v.sizeInches}"`,
        sizeInches: v.sizeInches,
        searchKey: v.searchKey,
        imagePublicPath: doc.imagePublicPath ?? null,
        catalogCode: code,
        requiresRotation: v.requiresRotation,
        growers: v.growers,
      });
    }
  }
  out.sort((a, b) => {
    const an = (a.commonName || a.name).toLowerCase();
    const bn = (b.commonName || b.name).toLowerCase();
    const c = an.localeCompare(bn, undefined, { sensitivity: "base" });
    if (c !== 0) return c;
    return (a.sizeInches ?? 0) - (b.sizeInches ?? 0);
  });
  return out;
}

const plants: PlantCatalogEntry[] = buildFlatPlantCatalogFromReference();

export function listPlants(): PlantCatalogEntry[] {
  return plants;
}

/** Pots: canonical entry derived from the JSC WH2 pricelist JSON. */
export interface PotCatalogEntry {
  id: string;
  name: string;
  suppliers: GrowerOption[];
  sku?: string;
  family?: string;
  kind?: string;
  baseName?: string;
  exteriorSize?: string | null;
  interiorOpening?: string | null;
  sizeInches?: number | null;
  mapPrice?: number | null;
  wholesalePrice?: number;
  searchKey?: string;
}

interface JscPotRow {
  id: string;
  sku: string;
  family: string;
  kind: string;
  baseName: string;
  name: string;
  exteriorSize: string | null;
  interiorOpening: string | null;
  sizeInches: number | null;
  mapPrice: number | null;
  wholesalePrice: number;
  source?: string;
}

const JSC_POTS = (potsCatalogJson as { pots: JscPotRow[] }).pots;

const POT_SUPPLIER_POOL: Array<Omit<GrowerOption, "price">> = [
  {
    id: "jsc-wh2",
    name: "JSC WH2 Professional",
    address: "7425 Distribution Way, Orlando, FL",
  },
  {
    id: "planter-depot",
    name: "Planter Depot Central",
    address: "1840 Trade Center Dr, Orlando, FL",
  },
  {
    id: "urban-pottery",
    name: "Urban Pottery Supply",
    address: "505 Logistics Loop, Kissimmee, FL",
  },
  {
    id: "coastal-containers",
    name: "Coastal Containers Wholesale",
    address: "2550 Commerce Park Dr, Altamonte Springs, FL",
  },
];

function pseudoPotSuppliers(row: JscPotRow): GrowerOption[] {
  let h = 0;
  const seed = `${row.id}|${row.sku}|${row.family}|${row.kind}`;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  }
  // Some rows intentionally keep a single supplier so UI fallback can surface
  // similar-size alternatives when supplier choice is too narrow.
  const count = 1 + (h % 3); // 1..3 suppliers
  const spreads = [1, 1.06, 1.12, 1.18];
  const picks: GrowerOption[] = [];
  for (let i = 0; i < POT_SUPPLIER_POOL.length; i++) {
    const base = POT_SUPPLIER_POOL[(h + i) % POT_SUPPLIER_POOL.length];
    if (picks.some((p) => p.id === base.id)) continue;
    const spread = spreads[i] ?? spreads[spreads.length - 1];
    picks.push({
      ...base,
      price: Number((row.wholesalePrice * spread).toFixed(2)),
    });
    if (picks.length >= count) break;
  }
  return picks.length
    ? picks
    : [
        {
          ...POT_SUPPLIER_POOL[0],
          price: Number(row.wholesalePrice.toFixed(2)),
        },
      ];
}

const pots: PotCatalogEntry[] = JSC_POTS.map((row) => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  family: row.family,
  kind: row.kind,
  baseName: row.baseName,
  exteriorSize: row.exteriorSize,
  interiorOpening: row.interiorOpening,
  sizeInches: row.sizeInches,
  mapPrice: row.mapPrice,
  wholesalePrice: row.wholesalePrice,
  suppliers: pseudoPotSuppliers(row),
  searchKey: buildSearchKey([
    row.name,
    row.baseName,
    row.family,
    row.kind,
    row.sku,
    row.exteriorSize ?? undefined,
  ]),
}));

export function listPots(): PotCatalogEntry[] {
  return pots;
}

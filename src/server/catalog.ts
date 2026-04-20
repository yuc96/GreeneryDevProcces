import potsCatalogJson from "@/data/pots-catalog.json";
import plantReferenceJson from "@/data/plant-reference-images.json";

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

const DEFAULT_GROWERS: GrowerOption[] = [
  {
    id: "g1",
    name: "Sunshine Nurseries",
    price: 0,
    address: "123 Floral Way, Apopka, FL",
  },
  {
    id: "g2",
    name: "Green Leaf Farms",
    price: 0,
    address: "456 Plant St, Homestead, FL",
  },
  {
    id: "g3",
    name: "Exotic Botanicals",
    price: 0,
    address: "789 Orchid Blvd, Miami, FL",
  },
];

function pseudoGrowersFor(code: string, basePrice: number): GrowerOption[] {
  let h = 0;
  for (let i = 0; i < code.length; i++) {
    h = (h * 31 + code.charCodeAt(i)) >>> 0;
  }
  const shifts = [0, 0.08, 0.16];
  const picks: GrowerOption[] = [];
  for (let i = 0; i < DEFAULT_GROWERS.length; i++) {
    const g = DEFAULT_GROWERS[(h + i) % DEFAULT_GROWERS.length];
    if (picks.some((p) => p.id === g.id)) continue;
    picks.push({
      ...g,
      price: Number((basePrice * (1 + shifts[i % shifts.length])).toFixed(2)),
    });
    if (picks.length >= 2 + ((h >> 3) % 2)) break;
  }
  return picks;
}

/** Rough wholesale price band by pot size for the pseudo-grower seed. */
function estimatePlantBasePrice(sizeInches: number | null | undefined): number {
  if (!sizeInches) return 28;
  if (sizeInches <= 6) return 14;
  if (sizeInches <= 10) return 22;
  if (sizeInches <= 14) return 38;
  if (sizeInches <= 20) return 65;
  return 95;
}

function buildSearchKey(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

const PLANT_REFERENCE = plantReferenceJson as {
  plants: Array<{
    catalogCode: string;
    selectionSheet?: string;
    commonName: string;
    scientificName?: string;
    imageFile?: string;
    imagePublicPath?: string;
  }>;
};

/** Approximate size-per-plant mapping so labor/pot-matching can infer a band. */
const DEFAULT_SIZE_INCHES_BY_SELECTION: Record<string, number> = {
  SELECTION_C: 14,
  SHEET_2: 10,
  SHEET_3: 14,
  SHEET_4: 17,
  SHEET_5: 10,
  SHEET_6: 8,
};

const plants: PlantCatalogEntry[] = PLANT_REFERENCE.plants.map((p) => {
  const inches =
    DEFAULT_SIZE_INCHES_BY_SELECTION[p.selectionSheet ?? ""] ?? 12;
  const basePrice = estimatePlantBasePrice(inches);
  const growers = pseudoGrowersFor(p.catalogCode, basePrice);
  return {
    id: `plant-${p.catalogCode.toLowerCase()}`,
    name: p.commonName,
    commonName: p.commonName,
    scientificName: p.scientificName,
    size: `${inches}"`,
    sizeInches: inches,
    requiresRotation: false,
    catalogCode: p.catalogCode,
    imagePublicPath: p.imagePublicPath ?? null,
    searchKey: buildSearchKey([
      p.commonName,
      p.scientificName,
      p.catalogCode,
      p.selectionSheet,
    ]),
    growers: growers.length
      ? growers
      : [{ ...DEFAULT_GROWERS[0], price: basePrice }],
  };
});

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
    address: "905 Industrial Ave, Tampa, FL",
  },
  {
    id: "coastal-containers",
    name: "Coastal Containers Wholesale",
    address: "3120 Harbor Commerce Blvd, Miami, FL",
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

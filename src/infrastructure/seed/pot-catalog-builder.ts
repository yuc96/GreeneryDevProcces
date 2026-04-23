import potsCatalogJson from "@/data/pots-catalog.json";
import type { GrowerOption } from "@/infrastructure/seed/plant-catalog-builder";

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

function buildSearchKey(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function pseudoPotSuppliers(row: JscPotRow): GrowerOption[] {
  let h = 0;
  const seed = `${row.id}|${row.sku}|${row.family}|${row.kind}`;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  }
  const count = 1 + (h % 3);
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

const JSC_POTS = (potsCatalogJson as { pots: JscPotRow[] }).pots;

export type PotCatalogMongoDoc = PotCatalogEntry & { _id: string };

export function buildPotCatalogDocuments(): PotCatalogMongoDoc[] {
  return JSC_POTS.map((row) => ({
    _id: row.id,
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
}

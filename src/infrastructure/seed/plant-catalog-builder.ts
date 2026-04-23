import plantReferenceJson from "@/data/plant-reference-images.json";
import {
  CANONICAL_POT_SIZES_INCHES,
  type CanonicalPotSizeInches,
  isCanonicalPotSizeInches,
} from "@/domain/catalog/canonical-sizes";

export interface GrowerOption {
  id: string;
  name: string;
  price: number;
  address: string;
}

const DEFAULT_GROWERS: GrowerOption[] = [
  {
    id: "g1",
    name: "Sunshine Nurseries",
    price: 0,
    address: "2525 Clarcona Rd, Apopka, FL 32703",
  },
  {
    id: "g2",
    name: "Green Leaf Farms",
    price: 0,
    address: "610 Garden Commerce Pkwy, Winter Garden, FL",
  },
  {
    id: "g3",
    name: "Exotic Botanicals",
    price: 0,
    address: "890 Plant District Rd, Sanford, FL",
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

function estimatePlantBasePrice(sizeInches: number | null | undefined): number {
  if (!sizeInches) return 28;
  if (sizeInches <= 2) return 4;
  if (sizeInches <= 3) return 5;
  if (sizeInches <= 6) return 14;
  if (sizeInches <= 12) return 22;
  if (sizeInches <= 14) return 38;
  if (sizeInches <= 21) return 65;
  return 95;
}

function buildSearchKey(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

type PlantReferenceRow = {
  catalogCode: string;
  selectionSheet?: string;
  commonName: string;
  scientificName?: string;
  imageFile?: string | null;
  imagePublicPath?: string | null;
  /** If set, only these pot sizes are generated for this catalog row. */
  offeredSizeInches?: number[];
  /** When true, all offered variants get `requiresRotation` for proposal rotation sync. */
  rotationProgram?: boolean;
  /** Optional table wholesale (first grower price) keyed by size string, e.g. `"6": 32`. */
  seedWholesalePricesBySize?: Record<string, number>;
};

const PLANT_REFERENCE = plantReferenceJson as {
  plants: PlantReferenceRow[];
};

const DEFAULT_SIZE_INCHES_BY_SELECTION: Record<string, number> = {
  SELECTION_C: 14,
  SHEET_2: 12,
  SHEET_3: 14,
  SHEET_4: 17,
  SHEET_5: 12,
  SHEET_6: 8,
};

function sizesForPlant(p: PlantReferenceRow): CanonicalPotSizeInches[] {
  if (p.offeredSizeInches?.length) {
    const out: CanonicalPotSizeInches[] = [];
    for (const n of p.offeredSizeInches) {
      if (isCanonicalPotSizeInches(n)) out.push(n);
    }
    if (out.length) return out;
  }
  return [...CANONICAL_POT_SIZES_INCHES];
}

function seedWholesaleForSize(
  p: PlantReferenceRow,
  sizeInches: CanonicalPotSizeInches,
): number | undefined {
  const raw = p.seedWholesalePricesBySize?.[String(sizeInches)];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function growersForVariant(
  p: PlantReferenceRow,
  sizeInches: CanonicalPotSizeInches,
): GrowerOption[] {
  const seed = seedWholesaleForSize(p, sizeInches);
  const base = seed ?? estimatePlantBasePrice(sizeInches);
  if (seed !== undefined) {
    return [{ ...DEFAULT_GROWERS[0], price: seed }];
  }
  const pseudo = pseudoGrowersFor(`${p.catalogCode}|${sizeInches}`, base);
  return pseudo.length
    ? pseudo
    : [{ ...DEFAULT_GROWERS[0], price: base }];
}

export interface PlantCatalogVariantDoc {
  sizeInches: CanonicalPotSizeInches;
  requiresRotation: boolean;
  growers: GrowerOption[];
  searchKey: string;
}

export interface PlantCatalogDoc {
  _id: string;
  catalogCode: string;
  commonName: string;
  scientificName?: string;
  imagePublicPath?: string | null;
  selectionSheet?: string;
  variants: PlantCatalogVariantDoc[];
}

export function buildPlantCatalogDocuments(): PlantCatalogDoc[] {
  return PLANT_REFERENCE.plants.map((p) => {
    const baseInches =
      DEFAULT_SIZE_INCHES_BY_SELECTION[p.selectionSheet ?? ""] ?? 12;
    const rotation = Boolean(p.rotationProgram);
    const sizes = sizesForPlant(p);
    const variants: PlantCatalogVariantDoc[] = sizes.map((sizeInches) => ({
      sizeInches,
      requiresRotation: rotation,
      growers: growersForVariant(p, sizeInches),
      searchKey: buildSearchKey([
        p.commonName,
        p.scientificName,
        p.catalogCode,
        p.selectionSheet,
        String(sizeInches),
      ]),
    }));
    return {
      _id: p.catalogCode,
      catalogCode: p.catalogCode,
      commonName: p.commonName,
      scientificName: p.scientificName,
      imagePublicPath: p.imagePublicPath ?? null,
      selectionSheet: p.selectionSheet,
      variants,
      /** Hint row used when a single default size was implied in legacy UI */
      defaultSizeInches: baseInches,
    };
  });
}

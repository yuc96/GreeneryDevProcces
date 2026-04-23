import type { Db } from "mongodb";
import { COL } from "@/infrastructure/mongo/collections";
import { asDocCollection } from "@/infrastructure/mongo/mongo-string-id";
import type { GrowerOption } from "@/infrastructure/seed/plant-catalog-builder";
import type { PotCatalogEntry } from "@/infrastructure/seed/pot-catalog-builder";
import type { StagingLibraryItem, StagingProviderOption } from "@/lib/staging-catalog";
import { cheapestStagingProvider } from "@/lib/staging-catalog";

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

export async function readPlantCatalogEntries(
  db: Db,
): Promise<PlantCatalogEntry[]> {
  const col = asDocCollection(db, COL.plantCatalog);
  const docs = await col.find({}).sort({ catalogCode: 1 }).toArray();
  const out: PlantCatalogEntry[] = [];
  for (const d of docs) {
    const catalogCode = String(d.catalogCode ?? d._id);
    const commonName = String(d.commonName ?? "");
    const variants = Array.isArray(d.variants) ? d.variants : [];
    for (const v of variants) {
      const inches = Number(v.sizeInches);
      if (!Number.isFinite(inches)) continue;
      out.push({
        id: `plant-${catalogCode.toLowerCase()}-${inches}`,
        name: commonName,
        commonName,
        scientificName:
          typeof d.scientificName === "string" ? d.scientificName : undefined,
        size: `${inches}"`,
        sizeInches: inches,
        searchKey: typeof v.searchKey === "string" ? v.searchKey : undefined,
        imagePublicPath:
          typeof d.imagePublicPath === "string" || d.imagePublicPath === null
            ? d.imagePublicPath
            : null,
        catalogCode,
        requiresRotation: Boolean(v.requiresRotation),
        growers: Array.isArray(v.growers)
          ? (v.growers as GrowerOption[])
          : [],
      });
    }
  }
  out.sort((a, b) => {
    const an = (a.commonName || a.name).toLowerCase();
    const bn = (b.commonName || b.name).toLowerCase();
    const c = an.localeCompare(bn, undefined, { sensitivity: "base" });
    if (c !== 0) return c;
    const as = a.sizeInches ?? 0;
    const bs = b.sizeInches ?? 0;
    return as - bs;
  });
  return out;
}

export async function readPotCatalogEntries(db: Db): Promise<PotCatalogEntry[]> {
  const col = asDocCollection(db, COL.potCatalog);
  const docs = await col.find({}).toArray();
  return docs.map((row) => {
    const r = row as unknown as Record<string, unknown> & { _id: unknown };
    const { _id, ...rest } = r;
    return { ...(rest as Omit<PotCatalogEntry, "id">), id: String(_id) };
  }) as PotCatalogEntry[];
}

export async function readStagingLibraryItems(
  db: Db,
  defaultMarkup: number,
): Promise<StagingLibraryItem[]> {
  const col = asDocCollection(db, COL.stagingCatalog);
  const docs = await col.find({}).sort({ _id: 1 }).toArray();
  return docs.map((raw) => {
    const s = raw as unknown as {
      _id: number;
      name: string;
      description: string;
      image: string;
      providers: Array<{ name: string; price: number }>;
    };
    const baseProviders = s.providers as StagingProviderOption[];
    const cheapest = cheapestStagingProvider(baseProviders);
    return {
      id: `staging-cat-${s._id}`,
      label: `${s.name} — ${s.description}`,
      wholesaleCost: cheapest.price,
      markup: defaultMarkup,
      description: s.description,
      imageUrl: s.image,
      providers: baseProviders.map((p) => ({
        ...p,
        address:
          p.name === "Home Depot"
            ? "2355 S Semoran Blvd, Orlando, FL 32822"
            : p.name === "Lowe's"
              ? "3500 S Orange Blossom Trl, Orlando, FL 32839"
              : "Orlando, FL",
      })),
      sourceId: s._id,
    };
  });
}

export interface PlantReferenceEntry {
  catalogCode: string;
  selectionSheet: string;
  commonName: string;
  scientificName: string;
  imageFile: string | null;
  imagePublicPath: string | null;
}

export interface PlantReferenceCatalog {
  version: number;
  notes: string;
  plants: PlantReferenceEntry[];
}

/** Strip trailing (14") style size from catalog line name. */
export function normalizePlantLineName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}

/** Suggest catalog rows that may match the proposal plant line. */
export function filterPlantReferenceForLine(
  plantLineName: string,
  plants: PlantReferenceEntry[],
): PlantReferenceEntry[] {
  const n = normalizePlantLineName(plantLineName).toLowerCase();
  if (!n) return plants.filter((p) => p.imagePublicPath);
  const words = n.split(/[\s/]+/).filter((w) => w.length > 2);
  return plants.filter((p) => {
    if (!p.imagePublicPath) return false;
    const c = p.commonName.toLowerCase();
    const s = p.scientificName.toLowerCase();
    if (n.includes(c) || c.includes(n)) return true;
    if (words.some((w) => c.includes(w) || s.includes(w))) return true;
    return false;
  });
}

export function catalogEntriesForPhotoPicker(
  plantLineName: string,
  filterText: string,
  plants: PlantReferenceEntry[],
  previewLimit = 36,
): PlantReferenceEntry[] {
  const withImg = plants.filter((p) => p.imagePublicPath);
  const q = filterText.trim().toLowerCase();
  if (q) {
    return withImg.filter(
      (p) =>
        p.commonName.toLowerCase().includes(q) ||
        p.scientificName.toLowerCase().includes(q) ||
        p.catalogCode.toLowerCase().includes(q),
    );
  }
  const suggested = filterPlantReferenceForLine(plantLineName, withImg);
  return suggested.length ? suggested : withImg.slice(0, previewLimit);
}

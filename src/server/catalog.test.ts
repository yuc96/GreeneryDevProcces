import { describe, expect, it } from "vitest";
import { CANONICAL_POT_SIZES_INCHES } from "@/domain/catalog/canonical-sizes";
import { buildPlantCatalogDocuments } from "@/infrastructure/seed/plant-catalog-builder";

const ALL_CANONICAL_INCHES = [...CANONICAL_POT_SIZES_INCHES];

function variantSizesSorted(
  docs: ReturnType<typeof buildPlantCatalogDocuments>,
  catalogCode: string,
): number[] {
  const row = docs.find((d) => d.catalogCode === catalogCode);
  expect(row).toBeDefined();
  return row!.variants.map((v) => v.sizeInches).sort((a, b) => a - b);
}

describe("plant catalog seed variants", () => {
  it("every species includes all canonical pot sizes", () => {
    const docs = buildPlantCatalogDocuments();
    for (const d of docs) {
      const got = d.variants.map((v) => v.sizeInches).sort((a, b) => a - b);
      expect(got).toEqual(ALL_CANONICAL_INCHES);
    }
  });

  it("JJSS orchid rotation line: all sizes flagged for rotation; seeded wholesale on 4 and 6", () => {
    const docs = buildPlantCatalogDocuments();
    const row = docs.find((d) => d.catalogCode === "JJSS");
    expect(row).toBeDefined();
    expect(variantSizesSorted(docs, "JJSS")).toEqual(ALL_CANONICAL_INCHES);
    for (const v of row!.variants) {
      expect(v.requiresRotation).toBe(true);
    }
    const v4 = row!.variants.find((v) => v.sizeInches === 4);
    const v6 = row!.variants.find((v) => v.sizeInches === 6);
    expect(v4?.growers[0]?.price).toBe(24);
    expect(v6?.growers[0]?.price).toBe(32);
  });

  it("JJDS orchid rotation line: all sizes; 6 inch keeps seeded wholesale", () => {
    const docs = buildPlantCatalogDocuments();
    const row = docs.find((d) => d.catalogCode === "JJDS");
    expect(row).toBeDefined();
    expect(variantSizesSorted(docs, "JJDS")).toEqual(ALL_CANONICAL_INCHES);
    expect(row!.variants.every((v) => v.requiresRotation)).toBe(true);
    const v6 = row!.variants.find((v) => v.sizeInches === 6);
    expect(v6?.growers[0]?.price).toBe(38.75);
  });

  it("Bromeliads (T): all sizes, rotation program", () => {
    const docs = buildPlantCatalogDocuments();
    const row = docs.find((d) => d.catalogCode === "T");
    expect(row).toBeDefined();
    expect(variantSizesSorted(docs, "T")).toEqual(ALL_CANONICAL_INCHES);
    for (const v of row!.variants) {
      expect(v.requiresRotation).toBe(true);
    }
  });

  it("Succulent and color rotation rows: all canonical sizes and rotationProgram", () => {
    const docs = buildPlantCatalogDocuments();
    expect(variantSizesSorted(docs, "SUC")).toEqual(ALL_CANONICAL_INCHES);
    expect(
      docs.find((d) => d.catalogCode === "SUC")?.variants.every(
        (v) => v.requiresRotation,
      ),
    ).toBe(true);

    expect(variantSizesSorted(docs, "CLRANN")).toEqual(ALL_CANONICAL_INCHES);
    expect(
      docs.find((d) => d.catalogCode === "CLRANN")?.variants.every(
        (v) => v.requiresRotation,
      ),
    ).toBe(true);

    expect(variantSizesSorted(docs, "CLRMUM")).toEqual(ALL_CANONICAL_INCHES);
    expect(
      docs.find((d) => d.catalogCode === "CLRMUM")?.variants.every(
        (v) => v.requiresRotation,
      ),
    ).toBe(true);
  });

  it("Color Bowl and Lady Jane: all sizes, rotation program", () => {
    const docs = buildPlantCatalogDocuments();
    expect(variantSizesSorted(docs, "V")).toEqual(ALL_CANONICAL_INCHES);
    expect(
      docs.find((d) => d.catalogCode === "V")?.variants.every(
        (v) => v.requiresRotation,
      ),
    ).toBe(true);

    expect(variantSizesSorted(docs, "CC")).toEqual(ALL_CANONICAL_INCHES);
    expect(
      docs.find((d) => d.catalogCode === "CC")?.variants.every(
        (v) => v.requiresRotation,
      ),
    ).toBe(true);
  });

  it("non-rotation plants are not flagged for rotation", () => {
    const docs = buildPlantCatalogDocuments();
    const kentia = docs.find((d) => d.commonName === "Kentia Palm");
    expect(kentia).toBeDefined();
    for (const v of kentia!.variants) {
      expect(v.requiresRotation).toBe(false);
    }
  });
});

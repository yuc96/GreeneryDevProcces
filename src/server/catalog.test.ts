import { describe, expect, it } from "vitest";
import { buildPlantCatalogDocuments } from "@/infrastructure/seed/plant-catalog-builder";

describe("plant catalog seed variants", () => {
  it("JJSS orchid rotation line only offers 4 and 6 inch variants", () => {
    const docs = buildPlantCatalogDocuments();
    const row = docs.find((d) => d.catalogCode === "JJSS");
    expect(row).toBeDefined();
    const inches = row!.variants.map((v) => v.sizeInches).sort((a, b) => a - b);
    expect(inches).toEqual([4, 6]);
    for (const v of row!.variants) {
      expect(v.requiresRotation).toBe(true);
    }
  });

  it("JJDS orchid rotation line only offers 6 inch", () => {
    const docs = buildPlantCatalogDocuments();
    const row = docs.find((d) => d.catalogCode === "JJDS");
    expect(row).toBeDefined();
    expect(row!.variants.map((v) => v.sizeInches)).toEqual([6]);
    expect(row!.variants[0]!.requiresRotation).toBe(true);
    expect(row!.variants[0]!.growers[0]!.price).toBe(38.75);
  });

  it("Bromeliads (T) only offers rotation sizes 4,6,8,14", () => {
    const docs = buildPlantCatalogDocuments();
    const row = docs.find((d) => d.catalogCode === "T");
    expect(row).toBeDefined();
    const inches = row!.variants.map((v) => v.sizeInches).sort((a, b) => a - b);
    expect(inches).toEqual([4, 6, 8, 14]);
    for (const v of row!.variants) {
      expect(v.requiresRotation).toBe(true);
    }
  });

  it("Succulent and color rotation rows use offered sizes and rotationProgram", () => {
    const docs = buildPlantCatalogDocuments();
    const suc = docs.find((d) => d.catalogCode === "SUC");
    expect(suc?.variants.map((v) => v.sizeInches).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 6,
    ]);
    expect(suc?.variants.every((v) => v.requiresRotation)).toBe(true);

    const ann = docs.find((d) => d.catalogCode === "CLRANN");
    expect(ann?.variants.map((v) => v.sizeInches).sort((a, b) => a - b)).toEqual([
      4, 6, 8,
    ]);
    expect(ann?.variants.every((v) => v.requiresRotation)).toBe(true);

    const mum = docs.find((d) => d.catalogCode === "CLRMUM");
    expect(mum?.variants.map((v) => v.sizeInches)).toEqual([6]);
    expect(mum?.variants[0]!.requiresRotation).toBe(true);
  });

  it("Color Bowl and Lady Jane are rotation program lines with offered sizes", () => {
    const docs = buildPlantCatalogDocuments();
    const bowl = docs.find((d) => d.catalogCode === "V");
    expect(bowl?.variants.map((v) => v.sizeInches).sort((a, b) => a - b)).toEqual(
      [4, 6, 8],
    );
    expect(bowl?.variants.every((v) => v.requiresRotation)).toBe(true);

    const lj = docs.find((d) => d.catalogCode === "CC");
    expect(lj?.variants.map((v) => v.sizeInches).sort((a, b) => a - b)).toEqual([
      4, 6,
    ]);
    expect(lj?.variants.every((v) => v.requiresRotation)).toBe(true);
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

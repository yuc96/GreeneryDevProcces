import { describe, expect, it } from "vitest";
import {
  bandForInches,
  computeAutoStagingForPlant,
  findStagingRecipe,
  type StagingMaterialRef,
} from "./auto-staging";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "./engine-schema";

const cfg = DEFAULT_PRICING_ENGINE_CONFIG;

// Mirror prices from src/data/staggings-list.json (cheapest provider).
const MATERIALS: Map<number, StagingMaterialRef> = new Map([
  [1, { sourceId: 1, name: "Hard Foam", unitWholesale: 7.97, vendorName: "Home Depot" }],
  [2, { sourceId: 2, name: "Soft Foam", unitWholesale: 4.97, vendorName: "Home Depot" }],
  [3, { sourceId: 3, name: "Moss", unitWholesale: 8.97, vendorName: "Home Depot" }],
  [4, { sourceId: 4, name: "Green Moss", unitWholesale: 13.97, vendorName: "Home Depot" }],
  [5, { sourceId: 5, name: "Soil", unitWholesale: 17.97, vendorName: "Home Depot" }],
  [6, { sourceId: 6, name: "Pine Bark", unitWholesale: 6.97, vendorName: "Home Depot" }],
  [7, { sourceId: 7, name: "Mulch", unitWholesale: 3.97, vendorName: "Home Depot" }],
  [8, { sourceId: 8, name: "Peanut Shell", unitWholesale: 11.97, vendorName: "Home Depot" }],
]);

describe("bandForInches", () => {
  it("maps inches into the right complexity band", () => {
    const bands = cfg.laborAuto.complexityBands;
    expect(bandForInches(bands, 6).id).toBe("small");
    expect(bandForInches(bands, 8).id).toBe("small");
    expect(bandForInches(bands, 9).id).toBe("medium");
    expect(bandForInches(bands, 14).id).toBe("medium");
    expect(bandForInches(bands, 15).id).toBe("large");
    expect(bandForInches(bands, 20).id).toBe("large");
    expect(bandForInches(bands, 24).id).toBe("xl");
    expect(bandForInches(bands, null).id).toBe("medium"); // fallback
  });
});

describe("findStagingRecipe", () => {
  it("locates a recipe by band + environment", () => {
    expect(findStagingRecipe(cfg.stagingRecipes, "medium", "indoor")?.id).toBe(
      "medium-indoor",
    );
    expect(findStagingRecipe(cfg.stagingRecipes, "large", "outdoor")?.id).toBe(
      "large-outdoor",
    );
  });

  it("returns null when no recipe matches", () => {
    expect(findStagingRecipe(cfg.stagingRecipes, "ghost", "indoor")).toBeNull();
  });
});

describe("computeAutoStagingForPlant (indoor)", () => {
  it("uses Medium-Indoor recipe for a 14\" plant", () => {
    // Medium-Indoor: 1× Hard Foam, 1× Soft Foam, 1× Moss per plant.
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p1",
        plantName: "Ficus 14\"",
        qty: 1,
        potSizeInches: 14,
        environment: "indoor",
      },
      cfg,
      MATERIALS,
    );
    expect(res.bandId).toBe("medium");
    expect(res.recipeId).toBe("medium-indoor");
    expect(res.components.map((c) => c.materialSourceId)).toEqual([1, 2, 3]);
    expect(res.components.every((c) => c.units === 1)).toBe(true);
    // 7.97 + 4.97 + 8.97 = 21.91
    expect(res.totalWholesaleCost).toBeCloseTo(21.91, 2);
  });

  it("scales material units by plant qty (ceil)", () => {
    // Large-Indoor: 2 hard foam + 1 soft foam + 1 green moss per plant.
    // 3 plants -> 6 hard, 3 soft, 3 green moss.
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p2",
        plantName: "Bird of Paradise 17\"",
        qty: 3,
        potSizeInches: 17,
        environment: "indoor",
      },
      cfg,
      MATERIALS,
    );
    expect(res.bandId).toBe("large");
    const byMat = Object.fromEntries(
      res.components.map((c) => [c.materialSourceId, c.units]),
    );
    expect(byMat[1]).toBe(6); // hard foam
    expect(byMat[2]).toBe(3); // soft foam
    expect(byMat[4]).toBe(3); // green moss
    // 6×7.97 + 3×4.97 + 3×13.97 = 47.82 + 14.91 + 41.91 = 104.64
    expect(res.totalWholesaleCost).toBeCloseTo(104.64, 2);
  });

  it("rounds fractional qtyPerPlant up", () => {
    // Patch the cfg to introduce 0.5 qty per plant for hard foam.
    const patched = {
      ...cfg,
      stagingRecipes: cfg.stagingRecipes.map((r) =>
        r.id === "small-indoor"
          ? {
              ...r,
              components: [
                { materialSourceId: 1, qtyPerPlant: 0.5, note: "shared" },
              ],
            }
          : r,
      ),
    };
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p3",
        plantName: "Pothos 6\"",
        qty: 3,
        potSizeInches: 6,
        environment: "indoor",
      },
      patched,
      MATERIALS,
    );
    // ceil(0.5 * 3) = 2 hard foams
    expect(res.components[0].units).toBe(2);
  });
});

describe("computeAutoStagingForPlant (outdoor)", () => {
  it("uses Outdoor recipe with soil + bark for a 14\" plant", () => {
    // Medium-Outdoor: 1× Soil + 1× Pine Bark per plant.
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p4",
        plantName: "Boxwood 12\"",
        qty: 5,
        potSizeInches: 12,
        environment: "outdoor",
      },
      cfg,
      MATERIALS,
    );
    expect(res.recipeId).toBe("medium-outdoor");
    const byMat = Object.fromEntries(
      res.components.map((c) => [c.materialSourceId, c.units]),
    );
    expect(byMat[5]).toBe(5); // soil
    expect(byMat[6]).toBe(5); // pine bark
    // 5×17.97 + 5×6.97 = 89.85 + 34.85 = 124.70
    expect(res.totalWholesaleCost).toBeCloseTo(124.7, 2);
  });
});

describe("computeAutoStagingForPlant edge cases", () => {
  it("returns 0 components when qty is 0", () => {
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p5",
        plantName: "X",
        qty: 0,
        potSizeInches: 14,
        environment: "indoor",
      },
      cfg,
      MATERIALS,
    );
    expect(res.components).toHaveLength(0);
    expect(res.totalWholesaleCost).toBe(0);
  });

  it("returns 0 components when material is missing from the catalog", () => {
    const empty = new Map<number, StagingMaterialRef>();
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p6",
        plantName: "X",
        qty: 2,
        potSizeInches: 14,
        environment: "indoor",
      },
      cfg,
      empty,
    );
    expect(res.components).toHaveLength(0);
  });

  it("falls back to Medium band when potSizeInches is null", () => {
    const res = computeAutoStagingForPlant(
      {
        plantLineId: "p7",
        plantName: "Unknown size",
        qty: 1,
        potSizeInches: null,
        environment: "indoor",
      },
      cfg,
      MATERIALS,
    );
    expect(res.bandId).toBe("medium");
    expect(res.recipeId).toBe("medium-indoor");
  });
});

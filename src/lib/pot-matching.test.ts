import { describe, expect, it } from "vitest";
import {
  bandForInches,
  DEFAULT_SIZE_BANDS,
  matchPotsForPlantSize,
  potsInSameBandAs,
} from "./pot-matching";
import type { PotCatalogEntry } from "./types";

function pot(
  id: string,
  size: number | null,
  price: number,
): PotCatalogEntry {
  return {
    id,
    name: id,
    suppliers: [{ id: "s", name: "s", address: "s", price }],
    sizeInches: size,
    wholesalePrice: price,
  };
}

const pots = [
  pot("p6", 6, 20),
  pot("p10", 10, 30),
  pot("p14", 14, 50),
  pot("p22", 22, 120),
];

describe("matchPotsForPlantSize", () => {
  it("prefers pots within ± slack inches of the plant size", () => {
    const out = matchPotsForPlantSize(pots, 12);
    expect(out[0].id).toBe("p10");
  });

  it("falls back to larger pots when nothing is within slack", () => {
    const out = matchPotsForPlantSize(pots, 18);
    expect(out[0].id).toBe("p22");
  });

  it("sorts cheapest first among ties", () => {
    const twoAt10 = [pot("a", 10, 50), pot("b", 10, 30)];
    const out = matchPotsForPlantSize(twoAt10, 10);
    expect(out[0].id).toBe("b");
  });

  it("sorts by price when plantSize is null", () => {
    const out = matchPotsForPlantSize(pots, null);
    expect(out[0].id).toBe("p6");
  });
});

describe("bandForInches / potsInSameBandAs", () => {
  it("buckets inches into the right band", () => {
    expect(bandForInches(DEFAULT_SIZE_BANDS, 6)?.id).toBe("small");
    expect(bandForInches(DEFAULT_SIZE_BANDS, 9)?.id).toBe("medium");
    expect(bandForInches(DEFAULT_SIZE_BANDS, 14)?.id).toBe("medium");
    expect(bandForInches(DEFAULT_SIZE_BANDS, 18)?.id).toBe("large");
    expect(bandForInches(DEFAULT_SIZE_BANDS, 22)?.id).toBe("xl");
    expect(bandForInches(DEFAULT_SIZE_BANDS, null)).toBeNull();
  });

  it("only returns pots in the same band as the plant", () => {
    // 12" plant -> Medium (9-14"). Only p10 and p14 qualify.
    const out = potsInSameBandAs(pots, 12);
    expect(out.map((p) => p.id)).toEqual(["p10", "p14"]);
  });

  it("returns an empty list when no pot is in the band", () => {
    // 18" plant -> Large (15-20"). None of [6,10,14,22] fit.
    const out = potsInSameBandAs(pots, 18);
    expect(out).toEqual([]);
  });

  it("returns [] when plantSize is null (no band)", () => {
    expect(potsInSameBandAs(pots, null)).toEqual([]);
  });
});

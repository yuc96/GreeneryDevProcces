import { describe, expect, it } from "vitest";
import {
  CANONICAL_POT_SIZES_INCHES,
  canonicalPotSizeInchesSchema,
  isCanonicalPotSizeInches,
} from "./canonical-sizes";

describe("canonical pot sizes", () => {
  it("exports the fixed inch set", () => {
    expect([...CANONICAL_POT_SIZES_INCHES]).toEqual([
      2, 4, 6, 8, 12, 14, 17, 21, 24,
    ]);
  });

  it("isCanonicalPotSizeInches narrows correctly", () => {
    expect(isCanonicalPotSizeInches(12)).toBe(true);
    expect(isCanonicalPotSizeInches(10)).toBe(false);
  });

  it("Zod schema accepts only canonical values", () => {
    expect(canonicalPotSizeInchesSchema.parse(21)).toBe(21);
    expect(() => canonicalPotSizeInchesSchema.parse(10)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { listPlants } from "./catalog";

describe("listPlants seed requiresRotation", () => {
  it("Orchids at 17 inches are flagged for rotation", () => {
    const orchids17 = listPlants().filter(
      (p) =>
        p.commonName === "Orchids" &&
        p.sizeInches === 17 &&
        p.size === '17"',
    );
    expect(orchids17.length).toBeGreaterThan(0);
    for (const p of orchids17) {
      expect(p.requiresRotation).toBe(true);
    }
  });

  it("non-orchid plants are not flagged by orchid-only seed rule", () => {
    const kentia = listPlants().find((p) => p.commonName === "Kentia Palm");
    expect(kentia).toBeDefined();
    expect(kentia!.requiresRotation).toBe(false);
  });
});

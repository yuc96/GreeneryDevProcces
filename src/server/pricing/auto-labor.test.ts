import { describe, expect, it } from "vitest";
import { DEFAULT_LABOR_ENGINE_CONFIG } from "./labor-engine-schema";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "./engine-schema";
import {
  computeAutoLaborLines,
  computeSimplifiedLabor,
  simulateDriveMinutes,
} from "./auto-labor";

const baseCfg = DEFAULT_PRICING_ENGINE_CONFIG;
const laborCfg = DEFAULT_LABOR_ENGINE_CONFIG;

describe("computeAutoLaborLines (PWU engine)", () => {
  it("matches prompt example totals when drive is 0.75h each way", () => {
    const res = computeAutoLaborLines({
      plantItems: [
        { qty: 20, sizeInches: 6 },
        { qty: 15, sizeInches: 12 },
        { qty: 3, sizeInches: 14 },
      ],
      potItems: [
        { qty: 20, sizeInches: 6 },
        { qty: 15, sizeInches: 12 },
        { qty: 3, sizeInches: 14 },
      ],
      stagingItems: [
        { catalogId: "staging-auto-x-5", qty: 3 },
        { catalogId: "staging-auto-x-3", qty: 2 },
      ],
      driveMinutesOneWay: null,
      driveLegs: {
        toJobHours: 0.75,
        fromJobHours: 0.75,
        mapsApiFallbackUsed: false,
      },
      config: baseCfg,
      laborConfig: laborCfg,
    });

    expect(res.pwuLoadUnload).toBeCloseTo(98.7, 5);
    expect(res.pwuInstall).toBeCloseTo(56, 5);
    expect(res.peakPeople).toBe(1);
    expect(res.totalInstallMinutes).toBe(56);

    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    expect(byKey.load!.hours).toBe(4);
    expect(byKey.unload!.hours).toBe(3.25);
    expect(byKey.install!.hours).toBe(1);
    expect(byKey.cleanUp!.hours).toBe(0.5);
    expect(byKey.driveToJob!.hours).toBe(0.75);
    expect(byKey.driveFromJob!.hours).toBe(0.75);
    expect(res.totalLaborCost).toBeCloseTo(358.75, 2);
  });

  it("uses two installers when any plant is 17 inch or larger", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 1, sizeInches: 17 }],
      driveMinutesOneWay: 15,
      config: baseCfg,
      laborConfig: laborCfg,
    });
    expect(res.peakPeople).toBe(2);
    expect(res.peopleAssignmentRuleMatched).toBe("plants_17_or_larger");
  });

  it("counts fallback size when diameter is missing", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 3, name: "Unknown pot size plant" }],
      driveMinutesOneWay: 10,
      config: baseCfg,
      laborConfig: laborCfg,
    });
    expect(res.fallbackDiameterCount).toBe(3);
    expect(res.totalInstallMinutes).toBe(3);
  });

  it("parses diameter from plant name when available", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 4, name: 'Ficus Lyrata 12"' }],
      driveMinutesOneWay: 10,
      config: baseCfg,
      laborConfig: laborCfg,
    });
    expect(res.fallbackDiameterCount).toBe(0);
    expect(res.totalInstallMinutes).toBe(8);
  });

  it("snaps 19 inch plants to 21 inch PWU band", () => {
    const res = computeAutoLaborLines({
      plantItems: [
        { qty: 50, sizeInches: 8 },
        { qty: 30, sizeInches: 12 },
        { qty: 20, sizeInches: 14 },
        { qty: 2, sizeInches: 19 },
      ],
      driveMinutesOneWay: 30,
      config: baseCfg,
      laborConfig: laborCfg,
    });
    expect(res.peakPeople).toBe(2);
    expect(res.peopleAssignmentRuleMatched).toBe("plants_17_or_larger");
    expect(res.bands).toEqual([]);
  });
});

describe("computeSimplifiedLabor (requirements)", () => {
  it("uses fallback pot size for all units when no catalog lines", () => {
    const res = computeSimplifiedLabor({
      plantCount: 4,
      driveMinutesOneWay: 20,
      config: baseCfg,
      laborConfig: laborCfg,
    });
    expect(res.totalInstallHours).toBeCloseTo(0.07, 2);
    expect(res.peakPeople).toBe(1);
    expect(res.fallbackDiameterCount).toBe(4);
  });

  it("handles zero plants safely", () => {
    const res = computeSimplifiedLabor({
      plantCount: 0,
      driveMinutesOneWay: 30,
      config: baseCfg,
      laborConfig: laborCfg,
    });
    expect(res.totalInstallHours).toBe(0);
    expect(res.peakPeople).toBe(1);
    expect(res.clockMinutesPerPerson).toBe(0);
  });
});

describe("simulateDriveMinutes", () => {
  it("is deterministic and within bounds", () => {
    const a = simulateDriveMinutes("client-1", 60);
    const b = simulateDriveMinutes("client-1", 60);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(60);
    expect(simulateDriveMinutes("", 60)).toBe(0);
  });
});

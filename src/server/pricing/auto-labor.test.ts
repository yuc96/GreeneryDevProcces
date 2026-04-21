import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "./engine-schema";
import {
  computeAutoLaborLines,
  computeSimplifiedLabor,
  simulateDriveMinutes,
} from "./auto-labor";

const baseCfg = DEFAULT_PRICING_ENGINE_CONFIG;

describe("computeAutoLaborLines (CPP staffing)", () => {
  it("uses CPP points exactly at 8, 10, 14 and 19+", () => {
    const res = computeAutoLaborLines({
      plantItems: [
        { qty: 50, sizeInches: 8 },
        { qty: 30, sizeInches: 10 },
        { qty: 20, sizeInches: 14 },
        { qty: 2, sizeInches: 19 },
      ],
      driveMinutesOneWay: 30,
      config: baseCfg,
    });

    expect(res.totalInstallMinutes).toBe(600);
    expect(res.bands.some((b) => b.bandLabel.includes('<=8"'))).toBe(true);
    expect(res.bands.some((b) => b.bandLabel === '10"')).toBe(true);
    expect(res.bands.some((b) => b.bandLabel === '14"')).toBe(true);
    expect(res.bands.some((b) => b.bandLabel.includes('>=19"'))).toBe(true);
  });

  it("interpolates diameters 9, 12 and 17 linearly", () => {
    const res = computeAutoLaborLines({
      plantItems: [
        { qty: 41, sizeInches: 9 }, // CPP 40 -> 2 people
        { qty: 26, sizeInches: 12 }, // CPP 25 -> 2 people
        { qty: 17, sizeInches: 17 }, // CPP 8.3 -> 3 people
      ],
      driveMinutesOneWay: 0,
      config: baseCfg,
    });

    expect(res.totalInstallMinutes).toBe(720);
    expect(res.peakPeople).toBe(6);
    expect(res.clockMinutesPerPerson).toBeCloseTo(120, 5);
  });

  it("uses CPP fallback=1.5 when diameter is missing", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 3, name: "Unknown pot size plant" }],
      driveMinutesOneWay: 10,
      config: baseCfg,
    });

    expect(res.fallbackDiameterCount).toBe(3);
    expect(res.totalInstallMinutes).toBe(240);
    expect(res.bands.some((b) => b.bandId === "missing-diameter")).toBe(true);
  });

  it("parses diameter from plant name when available", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 4, name: 'Ficus Lyrata 10"' }],
      driveMinutesOneWay: 10,
      config: baseCfg,
    });

    expect(res.fallbackDiameterCount).toBe(0);
    expect(res.totalInstallMinutes).toBe(120);
    expect(res.bands.some((b) => b.bandLabel === '10"')).toBe(true);
  });

  it("scales to high volume with deterministic rounding", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 1000, sizeInches: 8 }],
      driveMinutesOneWay: 0,
      config: baseCfg,
    });
    // Threshold model caps staffing at 2 people per line.
    expect(res.totalInstallMinutes).toBe(240);
    expect(res.peakPeople).toBe(2);
  });
});

describe("computeSimplifiedLabor (requirements fallback)", () => {
  it("applies fallback CPP to all requirement units", () => {
    const res = computeSimplifiedLabor({
      plantCount: 4,
      driveMinutesOneWay: 20,
      config: baseCfg,
    });
    // fallback threshold 1.5 => qty=4 => 2 people => 2*120=240 min
    expect(res.totalInstallHours).toBe(4);
    expect(res.peakPeople).toBe(2);
    expect(res.fallbackDiameterCount).toBe(4);
  });

  it("supports configurable threshold overrides", () => {
    const cfg = {
      ...baseCfg,
      laborAuto: {
        ...baseCfg.laborAuto,
        missingDiameterTwoPeopleThresholdQty: 999,
      },
    };
    const res = computeSimplifiedLabor({
      plantCount: 4,
      driveMinutesOneWay: 20,
      config: cfg,
    });
    expect(res.peakPeople).toBe(1);
    expect(res.totalInstallHours).toBe(2);
  });

  it("handles zero plants safely", () => {
    const res = computeSimplifiedLabor({
      plantCount: 0,
      driveMinutesOneWay: 30,
      config: baseCfg,
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

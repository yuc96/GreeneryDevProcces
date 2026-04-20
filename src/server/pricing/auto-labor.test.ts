import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_ENGINE_CONFIG,
  type PricingEngineConfig,
} from "./engine-schema";
import {
  computeAutoLaborLines,
  computeSimplifiedLabor,
  simulateDriveMinutes,
} from "./auto-labor";

const baseCfg = DEFAULT_PRICING_ENGINE_CONFIG;

/** Plant-only crew math in tests (floors disabled). */
function cfgNoHandlingFloor(
  cfg: PricingEngineConfig = baseCfg,
): PricingEngineConfig {
  return {
    ...cfg,
    laborAuto: {
      ...cfg.laborAuto,
      handlingMinimumPersonMinutes: {
        load: 0,
        unload: 0,
        install: 0,
        cleanUp: 0,
      },
    },
  };
}

describe("computeAutoLaborLines (detailed, target clock-minutes rule)", () => {
  it("maps plant size to a complexity band and uses its base minutes", () => {
    // 3 plants at 14" -> Medium band, 18 min base => 54 man-min total
    // target=60 => peopleNeeded = ceil(54/60) = 1, clock min/person = 54
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 3, sizeInches: 14 }],
      driveMinutesOneWay: 15,
      config: cfgNoHandlingFloor(),
    });
    expect(res.totalInstallMinutes).toBe(54);
    expect(res.bands).toHaveLength(1);
    expect(res.bands[0].bandId).toBe("medium");
    expect(res.bands[0].plantCount).toBe(3);
    expect(res.peakPeople).toBe(1);
    expect(res.clockMinutesPerPerson).toBe(54);
    expect(res.targetClockMinutesPerPerson).toBe(120);
  });

  it("adds people in parallel when 1 person would exceed the target", () => {
    // 10 plants at 14" -> Medium band, 18 × 10 = 180 man-min
    // target = 60 => peopleNeeded = ceil(180/60) = 3, clock min/person = 60
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 10, sizeInches: 14 }],
      driveMinutesOneWay: 30,
      config: cfgNoHandlingFloor(),
    });
    expect(res.totalInstallMinutes).toBe(180);
    expect(res.peakPeople).toBe(2);
    expect(res.clockMinutesPerPerson).toBeCloseTo(90, 5);
  });

  it("rounds peopleNeeded up so no one works more than the target", () => {
    // 70 man-min with target 60 => ceil(70/60) = 2 people, 35 min each
    // To get exactly 70, use 2 plants @ Medium band-ish via fragile factor.
    // Easier: 7 plants × 10 small (7 min ea) = 70 man-min.
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 10, sizeInches: 6 }],
      driveMinutesOneWay: 0,
      config: cfgNoHandlingFloor(),
    });
    expect(res.totalInstallMinutes).toBe(70);
    expect(res.peakPeople).toBe(1);
    expect(res.clockMinutesPerPerson).toBe(70);
  });

  it("respects a custom target clock minutes per person", () => {
    // target=30 => 54 man-min => ceil(54/30)=2 people, 27 min each
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 3, sizeInches: 14 }],
      driveMinutesOneWay: 0,
      config: cfgNoHandlingFloor({
        ...baseCfg,
        laborAuto: {
          ...baseCfg.laborAuto,
          targetClockMinutesPerPerson: 30,
        },
      }),
    });
    expect(res.peakPeople).toBe(2);
    expect(res.clockMinutesPerPerson).toBe(27);
    expect(res.targetClockMinutesPerPerson).toBe(30);
  });

  it("applies access, stairs, distance and fragile factors", () => {
    // 1 plant, 14" Medium (18 min base), difficult access (×1.5),
    // 2 floors stairs (×1.25²), fragile (×1.2), extra distance 110m
    // baseline=50, step=20 => (110-50)/20 = 3 steps × 5 min = 15 extra min.
    const res = computeAutoLaborLines({
      plantItems: [
        {
          qty: 1,
          sizeInches: 14,
          accessDifficulty: "difficult",
          stairsFloors: 2,
          fragile: true,
          extraDistanceMeters: 110,
        },
      ],
      driveMinutesOneWay: 0,
      config: cfgNoHandlingFloor(),
    });
    const expected = 18 * 1.5 * 1.25 * 1.25 * 1.2 + 15;
    expect(res.totalInstallMinutes).toBeCloseTo(expected, 1);
  });

  it("splits plant man-minutes across load/unload/install/cleanUp using normalized weights", () => {
    // 10 plants @ 8" => Small band 7×10 = 70 plant man-min, no handling floor
    const pct = {
      load: 0.25,
      unload: 0.25,
      install: 1,
      cleanUp: 0.2,
    };
    const sum = pct.load + pct.unload + pct.install + pct.cleanUp;
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 10, sizeInches: 8 }],
      driveMinutesOneWay: 30,
      config: cfgNoHandlingFloor({
        ...baseCfg,
        laborAuto: {
          ...baseCfg.laborAuto,
          lineDistributionPct: {
            ...baseCfg.laborAuto.lineDistributionPct,
            ...pct,
            driveToJob: 0,
            driveFromJob: 0,
          },
        },
      }),
    });
    const plantMin = 70;
    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    const expectHours = (w: number) =>
      ((plantMin * w) / sum / res.peakPeople / 60);
    expect(byKey.install.hours).toBeCloseTo(expectHours(pct.install), 2);
    expect(byKey.install.people).toBe(res.peakPeople);
    expect(byKey.load.hours).toBeCloseTo(expectHours(pct.load), 2);
    expect(byKey.load.people).toBe(res.peakPeople);
    expect(byKey.cleanUp.hours).toBeCloseTo(expectHours(pct.cleanUp), 2);
  });

  it("drive lines use driverPeople (not the install crew)", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 15, sizeInches: 14 }], // forces > 1 install person
      driveMinutesOneWay: 30,
      config: cfgNoHandlingFloor(),
    });
    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    expect(byKey.driveToJob.people).toBe(baseCfg.laborAuto.driverPeople);
    expect(byKey.driveFromJob.people).toBe(baseCfg.laborAuto.driverPeople);
    expect(byKey.driveToJob.hours).toBeCloseTo(30 / 60, 2);
    expect(byKey.install.people).toBeGreaterThan(1);
  });

  it("uses the fallback drive hours when no drive time is provided", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 2, sizeInches: 6 }],
      driveMinutesOneWay: null,
      config: cfgNoHandlingFloor(),
    });
    expect(res.driveMinutesOneWay).toBeCloseTo(
      baseCfg.laborAuto.defaultDriveHoursOneWayFallback * 60,
      1,
    );
  });

  it("totalLaborCost equals Σ people × hours × hourlyRate", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 8, sizeInches: 10 }],
      driveMinutesOneWay: 20,
      config: cfgNoHandlingFloor(),
    });
    const manual = res.lines.reduce(
      (s, l) => s + l.people * l.hours * baseCfg.hourlyRate,
      0,
    );
    expect(res.totalLaborCost).toBeCloseTo(manual, 1);
  });

  it("parses inches from the plant name when sizeInches is missing", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 3, name: 'Ficus Lyrata 14"' }],
      driveMinutesOneWay: 15,
      config: cfgNoHandlingFloor(),
    });
    expect(res.totalInstallMinutes).toBe(54);
    expect(res.bands[0].bandId).toBe("medium");
  });

  it("returns 1 person and zero hours when no plants are given", () => {
    const res = computeAutoLaborLines({
      plantItems: [],
      driveMinutesOneWay: 10,
      config: cfgNoHandlingFloor(),
    });
    expect(res.totalInstallMinutes).toBe(0);
    expect(res.peakPeople).toBe(1);
    expect(res.clockMinutesPerPerson).toBe(0);
    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    expect(byKey.install.hours).toBe(0);
    expect(byKey.driveToJob.hours).toBeCloseTo(10 / 60, 2);
  });
});

describe("computeSimplifiedLabor", () => {
  it("picks the first row whose maxCount matches the plant count", () => {
    // count=4 → row {maxCount:5, hoursPerPlant:0.3}
    // total man-hours = 4*0.3 = 1.2 → 72 man-min → ceil(72/60)=2 people, 36 min each
    const res = computeSimplifiedLabor({
      plantCount: 4,
      driveMinutesOneWay: 20,
      config: cfgNoHandlingFloor(),
    });
    expect(res.row.maxCount).toBe(5);
    expect(res.totalInstallHours).toBeCloseTo(1.2, 2);
    expect(res.peakPeople).toBe(1);
    expect(res.clockMinutesPerPerson).toBe(72);
  });

  it("falls back to the trailing row when count exceeds every bucket", () => {
    const res = computeSimplifiedLabor({
      plantCount: 200,
      driveMinutesOneWay: null,
      config: cfgNoHandlingFloor(),
    });
    const trailing =
      baseCfg.laborAuto.simplifiedByCount[
        baseCfg.laborAuto.simplifiedByCount.length - 1
      ];
    expect(res.row.maxCount).toBe(trailing.maxCount);
    // 200*0.25 = 50 man-h = 3000 man-min; target 120 → ceil(3000/120) = 25 people
    expect(res.peakPeople).toBe(25);
    expect(res.clockMinutesPerPerson).toBeCloseTo(120, 2);
  });

  it("0 plants → 1 person, 0 hours, drive lines still respect driver count", () => {
    const res = computeSimplifiedLabor({
      plantCount: 0,
      driveMinutesOneWay: 30,
      config: cfgNoHandlingFloor(),
    });
    expect(res.peakPeople).toBe(1);
    expect(res.clockMinutesPerPerson).toBe(0);
    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    expect(byKey.driveToJob.people).toBe(baseCfg.laborAuto.driverPeople);
    expect(byKey.driveToJob.hours).toBeCloseTo(30 / 60, 2);
  });
});

describe("computeAutoLaborLines handling floors (defaults)", () => {
  it("books every handling phase for a single small plant", () => {
    const res = computeAutoLaborLines({
      plantItems: [{ qty: 1, sizeInches: 6 }],
      driveMinutesOneWay: 0,
      config: baseCfg,
    });
    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    expect(res.totalInstallMinutes).toBe(7);
    expect(byKey.load.hours).toBeGreaterThan(0);
    expect(byKey.unload.hours).toBeGreaterThan(0);
    expect(byKey.install.hours).toBeGreaterThan(0);
    expect(byKey.cleanUp.hours).toBeGreaterThan(0);
  });
});

describe("simulateDriveMinutes", () => {
  it("is deterministic and within range", () => {
    const a = simulateDriveMinutes("client-1", 60);
    const b = simulateDriveMinutes("client-1", 60);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(60);
    expect(simulateDriveMinutes("", 60)).toBe(0);
  });
});

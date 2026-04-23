import { describe, expect, it } from "vitest";
import { DEFAULT_LABOR_ENGINE_CONFIG } from "../labor-engine-schema";
import { estimateLaborLinesCore } from "./estimate-sync";
import type { LaborPlantSize } from "../labor-engine-schema";

function size(s: string): LaborPlantSize {
  return s as LaborPlantSize;
}

describe("estimateLaborLinesCore (prompt example)", () => {
  it("matches the worked example (drive legs fixed at 0.75h)", () => {
    const cfg = DEFAULT_LABOR_ENGINE_CONFIG;
    const res = estimateLaborLinesCore(
      {
        plants: [
          { size: size(`6"`), quantity: 20 },
          { size: size(`12"`), quantity: 15 },
          { size: size(`14"`), quantity: 3 },
        ],
        pots: [
          { size: size(`6"`), quantity: 20 },
          { size: size(`12"`), quantity: 15 },
          { size: size(`14"`), quantity: 3 },
        ],
        materials: [
          { type: "dirt", estimatedBulks: 3 },
          { type: "moss", estimatedBulks: 2 },
        ],
        drive: {
          toJobHours: 0.75,
          fromJobHours: 0.75,
          mapsApiFallbackUsed: false,
        },
      },
      cfg,
    );

    expect(res.pwuLoadUnload).toBeCloseTo(98.7, 5);
    expect(res.pwuInstall).toBeCloseTo(56, 5);
    expect(res.teamSize).toBe(1);
    expect(res.peopleAssignmentRuleMatched).toBe("default_1_person");

    const byKey = Object.fromEntries(res.lines.map((l) => [l.key, l]));
    expect(byKey.load!.hours).toBe(4);
    expect(byKey.unload!.hours).toBe(3.25);
    expect(byKey.install!.hours).toBe(1);
    expect(byKey.cleanUp!.hours).toBe(0.5);
    expect(byKey.driveToJob!.hours).toBe(0.75);
    expect(byKey.driveFromJob!.hours).toBe(0.75);

    const rate = 35;
    const total = res.lines.reduce((s, l) => s + l.people * l.hours * rate, 0);
    expect(total).toBeCloseTo(358.75, 2);
  });
});

describe("roundToQuarter via enforce paths", () => {
  it("uses two installers for 17 inch plants", () => {
    const cfg = DEFAULT_LABOR_ENGINE_CONFIG;
    const res = estimateLaborLinesCore(
      {
        plants: [{ size: size(`17"`), quantity: 2 }],
        pots: [],
        materials: [],
        drive: { toJobHours: 0.25, fromJobHours: 0.25, mapsApiFallbackUsed: true },
      },
      cfg,
    );
    expect(res.teamSize).toBe(2);
    expect(res.peopleAssignmentRuleMatched).toBe("plants_17_or_larger");
  });
});

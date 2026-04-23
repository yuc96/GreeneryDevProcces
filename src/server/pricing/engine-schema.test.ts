import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_ENGINE_CONFIG,
  mergeWithPricingDefaults,
} from "./engine-schema";

describe("mergeWithPricingDefaults", () => {
  it("ignores legacy null optionals in persisted pricing config", () => {
    const merged = mergeWithPricingDefaults({
      defaultRotationTruckFee: null,
      rotationTruckFeeOptions: null,
      rotationFrequencyWeeksOptions: null,
      defaultRotationFrequencyWeeks: null,
      defaultCommissionPct: null,
      maintenanceAnnualCostFraction: null,
      vendorHomeAddress: null,
      simulatedMaxDriveMinutes: null,
      laborAuto: {
        ...DEFAULT_PRICING_ENGINE_CONFIG.laborAuto,
        crewThresholdInstallMinutes: null,
        defaultLoadHours: null,
        defaultUnloadHours: null,
        defaultCleanupHours: null,
        crewSmall: null,
        crewLarge: null,
      },
    });

    expect(merged.schemaVersion).toBe(2);
    expect(merged.defaultRotationTruckFee).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.defaultRotationTruckFee,
    );
    expect(merged.rotationTruckFeeOptions).toEqual(
      DEFAULT_PRICING_ENGINE_CONFIG.rotationTruckFeeOptions,
    );
    expect(merged.rotationFrequencyWeeksOptions).toEqual([4, 6, 8]);
    expect(merged.defaultRotationFrequencyWeeks).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.defaultRotationFrequencyWeeks,
    );
    expect(merged.defaultCommissionPct).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.defaultCommissionPct,
    );
    expect(merged.maintenanceAnnualCostFraction).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.maintenanceAnnualCostFraction,
    );
    expect(merged.vendorHomeAddress).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.vendorHomeAddress,
    );
    expect(merged.simulatedMaxDriveMinutes).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.simulatedMaxDriveMinutes,
    );
    expect(merged.laborAuto.crewThresholdInstallMinutes).toBeUndefined();
    expect(merged.laborAuto.defaultLoadHours).toBeUndefined();
    expect(merged.laborAuto.defaultUnloadHours).toBeUndefined();
    expect(merged.laborAuto.defaultCleanupHours).toBeUndefined();
    expect(merged.laborAuto.crewSmall).toBeUndefined();
    expect(merged.laborAuto.crewLarge).toBeUndefined();
  });

  it("merges guarantee add-on and replacement reserve and upgrades schemaVersion from 1", () => {
    const merged = mergeWithPricingDefaults({
      schemaVersion: 1,
      guaranteeAnnualAddOnPct: 99,
      replacementReservePct: 7,
      hourlyRate: 40,
    } as Record<string, unknown>);
    expect(merged.schemaVersion).toBe(2);
    expect(merged.hourlyRate).toBe(40);
    expect(merged.guaranteeAnnualAddOnPct).toBe(99);
    expect(merged.replacementReservePct).toBe(7);
  });
});

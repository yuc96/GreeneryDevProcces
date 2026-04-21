import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "./engine-schema";
import {
  computeProposal,
  computeRotationMonthly,
  defaultLaborLines,
  installMinutesForInches,
  truckFeeForPlantCount,
} from "./compute-proposal";
import { parseSizeInchesFromText } from "./cpp-model";
import type { ProposalItemEntity } from "../domain";

const baseItem = (
  partial: Partial<ProposalItemEntity> & Pick<ProposalItemEntity, "category" | "name" | "qty" | "wholesaleCost" | "markup">,
): ProposalItemEntity => ({
  id: "x",
  catalogId: "c",
  area: "",
  freightRate: 0.2,
  clientOwnsPot: false,
  requiresRotation: false,
  vendorName: "",
  vendorAddress: "",
  ...partial,
});

describe("computeRotationMonthly", () => {
  it("matches doc structure P1+P2+P3", () => {
    const line = {
      qty: 15,
      frequencyWeeks: 8 as const,
      rotationUnitPrice: 32,
      truckFee: 25 as const,
    };
    const { p1, p2, p3, monthly } = computeRotationMonthly(
      line,
      DEFAULT_PRICING_ENGINE_CONFIG,
    );
    expect(p1).toBeCloseTo((15 * 32 * 8) / 12, 5);
    expect(p2).toBeCloseTo((((15 / 15) * 8) / 12) * 35, 5);
    expect(p3).toBeCloseTo((((15 / 15) * 8) / 12) * 25, 5);
    expect(monthly).toBeCloseTo(p1 + p2 + p3, 5);
  });
});

describe("truckFeeForPlantCount", () => {
  it("resolves default nested ranges 1-20 and 21+", () => {
    expect(truckFeeForPlantCount(1, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(25);
    expect(truckFeeForPlantCount(20, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(25);
    expect(truckFeeForPlantCount(21, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(50);
  });
});

describe("parseSizeInchesFromText", () => {
  it("parses trailing size in name", () => {
    expect(parseSizeInchesFromText('Ficus (14")')).toBe(14);
    expect(parseSizeInchesFromText('Orchid (6")')).toBe(6);
  });
});

describe("installMinutesForInches", () => {
  it("uses CPP interpolation for intermediate diameter", () => {
    // 12" is between 10"(CPP=30) and 14"(CPP=20) => CPP=25.
    expect(installMinutesForInches(12, DEFAULT_PRICING_ENGINE_CONFIG)).toBeCloseTo(
      120 / 25,
      5,
    );
  });
  it("uses <=8 point CPP", () => {
    expect(installMinutesForInches(6, DEFAULT_PRICING_ENGINE_CONFIG)).toBeCloseTo(
      120 / 50,
      5,
    );
  });
  it("uses fallback CPP when diameter is missing", () => {
    expect(
      installMinutesForInches(null, DEFAULT_PRICING_ENGINE_CONFIG),
    ).toBeCloseTo(120 / 1.5, 5);
  });
});

describe("computeProposal integration", () => {
  it("sums freight from config pcts", () => {
    const items: ProposalItemEntity[] = [
      baseItem({
        category: "plant",
        name: 'Test (10")',
        qty: 2,
        wholesaleCost: 10,
        markup: 2,
      }),
    ];
    const laborLines = defaultLaborLines().map((l) =>
      l.key === "load" ? { ...l, people: 1, hours: 1 } : l,
    );
    const res = computeProposal(DEFAULT_PRICING_ENGINE_CONFIG, {
      items,
      rotations: [],
      laborLines,
      commissionPct: 0,
      commissionBeneficiaries: 0,
    });
    expect(res.totals.plants.freight).toBeCloseTo(
      2 * 10 * DEFAULT_PRICING_ENGINE_CONFIG.plantFreightPct,
      5,
    );
    expect(res.totals.plants.retail).toBeCloseTo(2 * 10 * 2, 5);
    expect(res.laborCost).toBe(35);
    // qty=2 at 10" => CPP=30 => ceil(2/30)=1 person => 1 * target(120)
    expect(res.maintenanceBreakdown.totalInstallMinutes).toBe(120);
  });

  it("uses simplified 1-or-2 staffing thresholds for installation minutes", () => {
    const items: ProposalItemEntity[] = [
      baseItem({
        category: "plant",
        name: 'Large batch (8")',
        qty: 1000,
        wholesaleCost: 10,
        markup: 2,
      }),
    ];
    const res = computeProposal(DEFAULT_PRICING_ENGINE_CONFIG, {
      items,
      rotations: [],
      laborLines: defaultLaborLines(),
      commissionPct: 0,
      commissionBeneficiaries: 0,
    });
    expect(res.maintenanceBreakdown.totalInstallMinutes).toBe(240);
  });

  it("adds planting-without-pot surcharge per plant", () => {
    const items: ProposalItemEntity[] = [
      baseItem({
        category: "plant",
        name: 'Direct planting (10")',
        qty: 3,
        wholesaleCost: 20,
        markup: 2,
        plantingWithoutPot: true,
      }),
    ];
    const res = computeProposal(DEFAULT_PRICING_ENGINE_CONFIG, {
      items,
      rotations: [],
      laborLines: defaultLaborLines(),
      commissionPct: 0,
      commissionBeneficiaries: 0,
    });
    expect(res.totals.materials.retail).toBeCloseTo(
      3 * DEFAULT_PRICING_ENGINE_CONFIG.plantingWithoutPotFeePerPlant,
      5,
    );
  });
});

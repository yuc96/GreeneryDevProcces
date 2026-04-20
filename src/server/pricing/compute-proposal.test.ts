import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "./engine-schema";
import {
  computeProposal,
  computeRotationMonthly,
  defaultLaborLines,
  installMinutesForInches,
  parseSizeInchesFromText,
} from "./compute-proposal";
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

describe("parseSizeInchesFromText", () => {
  it("parses trailing size in name", () => {
    expect(parseSizeInchesFromText('Ficus (14")')).toBe(14);
    expect(parseSizeInchesFromText('Orchid (6")')).toBe(6);
  });
});

describe("installMinutesForInches", () => {
  it("uses large band 10-14", () => {
    expect(installMinutesForInches(12, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(2);
  });
  it("uses small band 6-8", () => {
    expect(installMinutesForInches(6, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(1);
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
    expect(res.totals.plants.freight).toBeCloseTo(2 * 10 * 0.2, 5);
    expect(res.totals.plants.retail).toBeCloseTo(2 * 10 * 2, 5);
    expect(res.laborCost).toBe(35);
    expect(res.maintenanceBreakdown.totalInstallMinutes).toBe(4);
  });
});

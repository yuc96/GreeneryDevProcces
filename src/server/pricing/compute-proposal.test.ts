import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING_ENGINE_CONFIG } from "./engine-schema";
import { DEFAULT_LABOR_ENGINE_CONFIG } from "./labor-engine-schema";
import {
  computeProposal,
  computeRotationMonthly,
  defaultLaborLines,
  installMinutesForInches,
  pickDefaultRotationCatalogPrice,
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
  it("matches GUTS P1 + P2 (capacity labor) + P3 (freight on rotation retail)", () => {
    const line = {
      qty: 15,
      frequencyWeeks: 8 as const,
      rotationUnitPrice: 32,
      truckFee: 0 as const,
      plantName: "Bromeliads (6\")",
    };
    const cfg = DEFAULT_PRICING_ENGINE_CONFIG;
    const { p1, p2, p3, monthly } = computeRotationMonthly(line, cfg);
    const f = 8;
    expect(p1).toBeCloseTo((15 * 32 * f) / 12, 5);
    expect(p2).toBeCloseTo((((15 / cfg.rotationPlantsPerHour) * f) / 12) * cfg.rotationLaborHourlyRate, 5);
    expect(p3).toBeCloseTo((15 * 32 * cfg.rotationFreightPct * f) / 12, 5);
    expect(monthly).toBeCloseTo(p1 + p2 + p3, 5);
  });

  it("uses higher plants/hour for orchid rotation lines (GUTS)", () => {
    const cfg = DEFAULT_PRICING_ENGINE_CONFIG;
    const bro = computeRotationMonthly(
      {
        qty: 20,
        frequencyWeeks: 8 as const,
        rotationUnitPrice: 10,
        truckFee: 0 as const,
        plantName: "Bromeliads (4\")",
      },
      cfg,
    );
    const orch = computeRotationMonthly(
      {
        qty: 20,
        frequencyWeeks: 8 as const,
        rotationUnitPrice: 10,
        truckFee: 0 as const,
        plantName: "Orchid — Single Spike (6\")",
      },
      cfg,
    );
    expect(orch.p2).toBeLessThan(bro.p2);
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

describe("pickDefaultRotationCatalogPrice", () => {
  const cfg = DEFAULT_PRICING_ENGINE_CONFIG;

  it("matches orchid spike variant and pot size", () => {
    expect(
      pickDefaultRotationCatalogPrice('Orchid — Single Spike (4")', cfg),
    ).toBe(24);
    expect(
      pickDefaultRotationCatalogPrice('Orchid — Single Spike (6")', cfg),
    ).toBe(32);
    expect(
      pickDefaultRotationCatalogPrice('Orchid — Double Spike (6")', cfg),
    ).toBe(38.75);
  });

  it("matches bromeliad size including 14 inch row", () => {
    expect(pickDefaultRotationCatalogPrice('Bromeliads (4")', cfg)).toBe(11.5);
    expect(pickDefaultRotationCatalogPrice('Bromeliads (14")', cfg)).toBe(200);
  });

  it("matches succulent table row and prefers neutral variant at 6 inch", () => {
    expect(pickDefaultRotationCatalogPrice('Succulent (2")', cfg)).toBe(4);
    expect(pickDefaultRotationCatalogPrice('Succulent (6")', cfg)).toBe(24);
  });

  it("matches color rotation annual and mum", () => {
    expect(
      pickDefaultRotationCatalogPrice('Color rotation — Annual (6")', cfg),
    ).toBe(13.75);
    expect(
      pickDefaultRotationCatalogPrice('Color rotation — Mum (6")', cfg),
    ).toBe(18.75);
  });

  it("treats Color Bowl as color rotation annual pricing", () => {
    expect(pickDefaultRotationCatalogPrice('Color Bowl (8")', cfg)).toBe(18.75);
  });

  it("matches Lady Jane and generic orchid to single spike when size is ambiguous", () => {
    expect(pickDefaultRotationCatalogPrice('Lady Jane (6")', cfg)).toBe(32);
    expect(pickDefaultRotationCatalogPrice('Orchids (6")', cfg)).toBe(32);
  });

  it("matches Spanish orchid label", () => {
    expect(
      pickDefaultRotationCatalogPrice('Orquídea — Single Spike (4")', cfg),
    ).toBe(24);
  });
});

describe("installMinutesForInches (labor install table)", () => {
  it("snaps 12 inch to nearest bucket (10 inch = 2 min per plant)", () => {
    expect(installMinutesForInches(12, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(2);
  });
  it("uses 6 inch bucket for 6 inches", () => {
    expect(installMinutesForInches(6, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(1);
  });
  it("uses pricing default minutes when diameter is missing", () => {
    expect(installMinutesForInches(null, DEFAULT_PRICING_ENGINE_CONFIG)).toBe(
      DEFAULT_PRICING_ENGINE_CONFIG.installMinutesDefault,
    );
  });
});

describe("computeProposal integration", () => {
  it("sums freight from config pcts", () => {
    const items: ProposalItemEntity[] = [
      baseItem({
        category: "plant",
        name: 'Test (12")',
        qty: 2,
        wholesaleCost: 10,
        markup: 2,
      }),
    ];
    const laborLines = defaultLaborLines().map((l) =>
      l.key === "load" ? { ...l, people: 1, hours: 1 } : l,
    );
    const res = computeProposal(
      DEFAULT_PRICING_ENGINE_CONFIG,
      {
        items,
        rotations: [],
        laborLines,
        commissionPct: 0,
        commissionBeneficiaries: 0,
      },
      { laborEngineConfig: DEFAULT_LABOR_ENGINE_CONFIG },
    );
    expect(res.totals.plants.freight).toBeCloseTo(
      2 * 10 * DEFAULT_PRICING_ENGINE_CONFIG.plantFreightPct,
      5,
    );
    expect(res.totals.plants.retail).toBeCloseTo(2 * 10 * 2, 5);
    expect(res.laborCost).toBe(35);
    expect(res.maintenanceBreakdown.totalInstallMinutes).toBe(4);
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
    const res = computeProposal(
      DEFAULT_PRICING_ENGINE_CONFIG,
      {
        items,
        rotations: [],
        laborLines: defaultLaborLines(),
        commissionPct: 0,
        commissionBeneficiaries: 0,
      },
      { laborEngineConfig: DEFAULT_LABOR_ENGINE_CONFIG },
    );
    expect(res.maintenanceBreakdown.totalInstallMinutes).toBe(1000);
  });

  it("adds planting-without-pot surcharge per plant", () => {
    const items: ProposalItemEntity[] = [
      baseItem({
        category: "plant",
        name: 'Direct planting (12")',
        qty: 3,
        wholesaleCost: 20,
        markup: 2,
        plantingWithoutPot: true,
      }),
    ];
    const res = computeProposal(
      DEFAULT_PRICING_ENGINE_CONFIG,
      {
        items,
        rotations: [],
        laborLines: defaultLaborLines(),
        commissionPct: 0,
        commissionBeneficiaries: 0,
      },
      { laborEngineConfig: DEFAULT_LABOR_ENGINE_CONFIG },
    );
    expect(res.totals.materials.retail).toBeCloseTo(
      3 * DEFAULT_PRICING_ENGINE_CONFIG.plantingWithoutPotFeePerPlant,
      5,
    );
  });
});

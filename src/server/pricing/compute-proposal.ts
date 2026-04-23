import type {
  ItemCategory,
  ProposalItemEntity,
  ProposalLaborLineEntity,
  ProposalLaborLineKey,
} from "../domain";
import { PROPOSAL_LABOR_KEYS } from "../domain";
import type { PricingEngineConfig, RotationCatalogEntry } from "./engine-schema";
import type { LaborEngineConfig } from "./labor-engine-schema";
import { parseSizeInchesFromText } from "./cpp-model";

export type LaborLineKey = ProposalLaborLineKey;
export type LaborLineState = ProposalLaborLineEntity;

export interface RotationLineState {
  qty: number;
  frequencyWeeks: 4 | 6 | 8;
  rotationUnitPrice: number;
  /** Legacy field; GUTS P3 uses `rotationFreightPct` on rotation retail. */
  truckFee: number;
  /** Drives orchid vs non-orchid labor capacity (GUTS §8). */
  plantName?: string;
}

export interface ProposalEngineInput {
  items: ProposalItemEntity[];
  rotations: RotationLineState[];
  laborLines: LaborLineState[];
  commissionPct: number;
  commissionBeneficiaries: number;
}

export interface ComputeProposalOptions {
  laborEngineConfig?: LaborEngineConfig;
}

export interface CategoryTotals {
  wholesale: number;
  retail: number;
  freight: number;
}

export interface MaintenanceBreakdown {
  wholesalePlantsTotal: number;
  totalInstallMinutes: number;
  installationHours: number;
  costPerMonthHours: number;
  costPerMonthPlants: number;
  tierEvaluationSum: number;
  overheadFactor: number;
  overhead: number;
  guaranteedMonthlyMaintenance: number;
}

export interface RotationBreakdownLine {
  qty: number;
  frequencyWeeks: number;
  rotationUnitPrice: number;
  truckFee: number;
  p1: number;
  p2: number;
  p3: number;
  monthly: number;
  annual: number;
}

export interface ComputeProposalResult {
  totals: {
    plants: CategoryTotals;
    pots: CategoryTotals;
    materials: CategoryTotals;
  };
  totalWholesale: number;
  totalFreight: number;
  totalRetail: number;
  laborCost: number;
  laborByLine: Partial<Record<LaborLineKey, number>>;
  maintenanceBreakdown: MaintenanceBreakdown;
  /** MMG/MM blend only (GUTS maintenance); no separate guaranteed-plant add-on. */
  maintenanceMonthly: number;
  rotationLines: RotationBreakdownLine[];
  rotationsAnnual: number;
  commissionGross: number;
  commissionPerBeneficiary: number;
  costBaseTotal: number;
  priceToClientInitial: number;
  priceToClientAnnual: number;
  grossMargin: number;
  marginPct: number;
}

function freightPctForCategory(
  cat: ItemCategory,
  config: PricingEngineConfig,
): number {
  if (cat === "plant") return config.plantFreightPct;
  if (cat === "pot") return config.potFreightPct;
  return config.materialFreightPct;
}

/**
 * Install minutes per plant for maintenance (GUTS §4): small band 6–8″,
 * large band 10–14″, default otherwise — from pricing engine bands only.
 */
export function maintenanceInstallMinutesPerPlant(
  inches: number | null,
  config: PricingEngineConfig,
): number {
  if (inches == null || !Number.isFinite(inches)) {
    return config.installMinutesDefault;
  }
  const n = inches;
  if (
    n >= config.largeBandMinInches &&
    n <= config.largeBandMaxInches
  ) {
    return config.installMinutesLargeBand;
  }
  if (
    n >= config.smallBandMinInches &&
    n <= config.smallBandMaxInches
  ) {
    return config.installMinutesSmallBand;
  }
  return config.installMinutesDefault;
}

/** Alias for maintenance install minutes (pricing bands). */
export function installMinutesForInches(
  inches: number | null,
  config: PricingEngineConfig,
  _laborCfg?: LaborEngineConfig,
): number {
  void _laborCfg;
  return maintenanceInstallMinutesPerPlant(inches, config);
}

function overheadFactorForSum(
  sum: number,
  config: PricingEngineConfig,
): number {
  const brackets = config.overheadBrackets;
  for (const b of brackets) {
    if (b.maxExclusive == null || sum < b.maxExclusive) return b.factor;
  }
  return brackets[brackets.length - 1]!.factor;
}

/** Plants/hour for rotation P2 labor (orchids: higher throughput in GUTS). */
export function rotationCapacityPlantsPerHour(
  plantName: string | undefined,
  config: PricingEngineConfig,
): number {
  const n = (plantName ?? "").toLowerCase();
  if (
    n.includes("orchid") ||
    n.includes("orquídea") ||
    n.includes("orquidea")
  ) {
    return config.rotationOrchidPlantsPerHour;
  }
  return config.rotationPlantsPerHour;
}

/**
 * GUTS §8 rotation monthly: P1 plant proration, P2 labor at capacity, P3 freight
 * on rotation catalog retail (not truck tables).
 */
export function computeRotationMonthly(
  line: RotationLineState,
  config: PricingEngineConfig,
): { p1: number; p2: number; p3: number; monthly: number } {
  const { qty, frequencyWeeks, rotationUnitPrice } = line;
  const f = frequencyWeeks;
  const cap = rotationCapacityPlantsPerHour(line.plantName, config);
  const laborRate = config.rotationLaborHourlyRate;
  const freightPct = config.rotationFreightPct;
  const p1 = (qty * rotationUnitPrice * f) / 12;
  const p2 = (((qty / cap) * f) / 12) * laborRate;
  const p3 = (qty * rotationUnitPrice * freightPct * f) / 12;
  return { p1, p2, p3, monthly: p1 + p2 + p3 };
}

export function truckFeeForPlantCount(
  plantCount: number,
  config: PricingEngineConfig,
): number {
  const count = Math.max(1, Math.floor(plantCount || 0));
  for (const r of config.rotationTruckFeeRanges) {
    if (r.to == null) {
      if (count >= r.from) return r.fee;
      continue;
    }
    if (count >= r.from && count <= r.to) return r.fee;
  }
  return config.defaultRotationTruckFee ?? 50;
}

export function computeProposal(
  config: PricingEngineConfig,
  input: ProposalEngineInput,
  options?: ComputeProposalOptions,
): ComputeProposalResult {
  void options?.laborEngineConfig;
  const totals = {
    plants: { wholesale: 0, retail: 0, freight: 0 },
    pots: { wholesale: 0, retail: 0, freight: 0 },
    materials: { wholesale: 0, retail: 0, freight: 0 },
  };

  let totalInstallMinutes = 0;
  let wholesalePlantsTotal = 0;
  let wholesaleGuaranteedPlants = 0;

  for (const item of input.items) {
    const isFreePot = item.category === "pot" && item.clientOwnsPot;
    const effW = isFreePot ? 0 : item.wholesaleCost * item.qty;
    const retail = isFreePot ? 0 : item.wholesaleCost * item.markup * item.qty;
    const pct = freightPctForCategory(item.category, config);
    const freight = isFreePot ? 0 : item.wholesaleCost * item.qty * pct;

    if (item.category === "plant") {
      totals.plants.wholesale += effW;
      totals.plants.retail += retail;
      totals.plants.freight += freight;
      if (item.plantingWithoutPot) {
        totals.materials.retail +=
          Math.max(0, Number(item.qty) || 0) * config.plantingWithoutPotFeePerPlant;
      }
      if (item.guaranteed) {
        wholesaleGuaranteedPlants += effW;
      }
      wholesalePlantsTotal += effW;
      const inches =
        typeof item.sizeInches === "number" && Number.isFinite(item.sizeInches)
          ? item.sizeInches
          : parseSizeInchesFromText(item.name);
      const perPlant = maintenanceInstallMinutesPerPlant(inches, config);
      totalInstallMinutes += Math.max(0, Number(item.qty) || 0) * perPlant;
    } else if (item.category === "pot") {
      totals.pots.wholesale += effW;
      totals.pots.retail += retail;
      totals.pots.freight += freight;
    } else {
      totals.materials.wholesale += effW;
      totals.materials.retail += retail;
      totals.materials.freight += freight;
    }
  }

  const totalWholesale =
    totals.plants.wholesale +
    totals.pots.wholesale +
    totals.materials.wholesale;
  const totalFreight =
    totals.plants.freight + totals.pots.freight + totals.materials.freight;
  const totalRetail =
    totals.plants.retail + totals.pots.retail + totals.materials.retail;

  const laborByLine = {} as Record<LaborLineKey, number>;
  let laborCost = 0;
  for (const line of input.laborLines) {
    const v =
      line.people * line.hours * config.hourlyRate;
    laborByLine[line.key] = v;
    laborCost += v;
  }

  const installationHours = totalInstallMinutes / 60;
  const costPerMonthHours =
    installationHours * config.hourlyRate * config.weeksPerMonth;
  const costPerMonthPlants =
    (wholesalePlantsTotal * config.plantWholesaleMonthlyFactor) / 12;
  const tierEvaluationSum = costPerMonthHours + costPerMonthPlants;
  const overheadFactor = overheadFactorForSum(tierEvaluationSum, config);
  const overhead =
    (costPerMonthHours + costPerMonthPlants) * overheadFactor;
  const mmgCore = costPerMonthHours + costPerMonthPlants + overhead;
  const mmCore = costPerMonthHours + overhead;
  const guaranteedWholesaleFrac =
    wholesalePlantsTotal > 0
      ? Math.min(1, Math.max(0, wholesaleGuaranteedPlants / wholesalePlantsTotal))
      : 1;
  const guaranteedMonthlyMaintenance =
    mmgCore * guaranteedWholesaleFrac + mmCore * (1 - guaranteedWholesaleFrac);

  const maintenanceBreakdown: MaintenanceBreakdown = {
    wholesalePlantsTotal,
    totalInstallMinutes,
    installationHours,
    costPerMonthHours,
    costPerMonthPlants,
    tierEvaluationSum,
    overheadFactor,
    overhead,
    guaranteedMonthlyMaintenance,
  };

  const rotationLines: RotationBreakdownLine[] = input.rotations.map((r) => {
    const { p1, p2, p3, monthly } = computeRotationMonthly(r, config);
    return {
      qty: r.qty,
      frequencyWeeks: r.frequencyWeeks,
      rotationUnitPrice: r.rotationUnitPrice,
      truckFee: r.truckFee,
      p1,
      p2,
      p3,
      monthly,
      annual: monthly * 12,
    };
  });
  const rotationsAnnual = rotationLines.reduce((a, r) => a + r.annual, 0);

  const beneficiaries = Math.max(0, Math.floor(input.commissionBeneficiaries));
  const pct = Math.max(0, input.commissionPct);
  const commissionGross =
    beneficiaries > 0
      ? totals.plants.retail * pct +
        totals.pots.retail * pct +
        totals.materials.retail * pct
      : 0;
  const commissionPerBeneficiary =
    beneficiaries > 0 ? commissionGross / beneficiaries : 0;

  const costBaseTotal = totalWholesale + totalFreight + laborCost;
  const priceToClientInitial =
    totalRetail + totalFreight + laborCost + commissionGross;
  const maintenanceMonthly = guaranteedMonthlyMaintenance;
  const priceToClientAnnual =
    priceToClientInitial +
    rotationsAnnual +
    maintenanceMonthly * 12;
  // `maintenanceAnnualCostFraction` is an internal dial (not in GUTS doc) to
  // approximate maintenance COGS in margin; doc-aligned revenue is §10 above.
  const grossMargin =
    priceToClientAnnual -
    costBaseTotal -
    maintenanceMonthly * 12 * config.maintenanceAnnualCostFraction;
  const marginPct =
    priceToClientAnnual > 0 ? (grossMargin / priceToClientAnnual) * 100 : 0;

  return {
    totals,
    totalWholesale,
    totalFreight,
    totalRetail,
    laborCost,
    laborByLine,
    maintenanceBreakdown,
    maintenanceMonthly,
    rotationLines,
    rotationsAnnual,
    commissionGross,
    commissionPerBeneficiary,
    costBaseTotal,
    priceToClientInitial,
    priceToClientAnnual,
    grossMargin,
    marginPct,
  };
}

export function defaultLaborLines(): LaborLineState[] {
  return PROPOSAL_LABOR_KEYS.map((key) => ({ key, people: 0, hours: 0 }));
}

export function normalizeLaborLines(
  lines: ProposalLaborLineEntity[] | undefined,
): ProposalLaborLineEntity[] {
  const byKey = new Map((lines ?? []).map((l) => [l.key, l]));
  return PROPOSAL_LABOR_KEYS.map((key) => {
    const x = byKey.get(key);
    return {
      key,
      people: Math.max(0, Number(x?.people) || 0),
      hours: Math.max(0, Number(x?.hours) || 0),
    };
  });
}

function normRotationText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function variantMatchesName(catalogVariant: string, plantNorm: string): boolean {
  const v = normRotationText(catalogVariant).replace(/^-+|-+$/g, "");
  if (!v || v === "-" || v === "—") return true;
  return plantNorm.includes(v);
}

function isNeutralRotationVariant(catalogVariant: string): boolean {
  const v = normRotationText(catalogVariant).replace(/^-+|-+$/g, "");
  return v.length === 0;
}

function pickRotationEntryForSize(
  pool: RotationCatalogEntry[],
  plantNorm: string,
  sizeInches: number | null,
): RotationCatalogEntry | undefined {
  const sized =
    sizeInches != null
      ? pool.filter((c) => c.sizeInches === sizeInches)
      : [];
  const bucket = sized.length ? sized : pool;
  if (bucket.length === 1) return bucket[0];
  if (bucket.length === 0) return undefined;
  if (plantNorm.includes("mum")) {
    const m = bucket.filter((c) => normRotationText(c.variant).includes("mum"));
    if (m.length) return m[0];
  }
  if (plantNorm.includes("annual")) {
    const m = bucket.filter((c) =>
      normRotationText(c.variant).includes("annual"),
    );
    if (m.length) return m[0];
  }
  const neutral = bucket.filter((c) => isNeutralRotationVariant(c.variant));
  return neutral[0] ?? bucket[0];
}

/**
 * Picks the rotation wholesale row that best matches the proposal plant line name
 * (common name + pot size), using `parseSizeInchesFromText` and rotationCatalog
 * group / variant / sizeInches.
 */
export function pickDefaultRotationCatalogPrice(
  plantName: string,
  config: PricingEngineConfig,
): number {
  const cat = config.rotationCatalog;
  const fallback = cat[0]?.price ?? 10;
  const n = normRotationText(plantName);
  const sizeInches = parseSizeInchesFromText(plantName);

  const byGroup = (g: string) => cat.filter((c) => c.group === g);

  let pool: typeof cat;
  if (n.includes("color rotation")) {
    pool = byGroup("Color rotation");
    if (n.includes("mum")) {
      const narrowed = pool.filter((c) =>
        normRotationText(c.variant).includes("mum"),
      );
      if (narrowed.length) pool = narrowed;
    } else if (n.includes("annual")) {
      const narrowed = pool.filter((c) =>
        normRotationText(c.variant).includes("annual"),
      );
      if (narrowed.length) pool = narrowed;
    }
  } else if (n.includes("color bowl")) {
    pool = byGroup("Color rotation");
    const annualOnly = pool.filter((c) =>
      normRotationText(c.variant).includes("annual"),
    );
    if (annualOnly.length) pool = annualOnly;
  } else if (
    n.includes("orchid") ||
    n.includes("orquídea") ||
    n.includes("orquidea") ||
    n.includes("lady jane") ||
    n.includes("anthurium")
  ) {
    pool = byGroup("Orchids");
    if (n.includes("double spike")) {
      const narrowed = pool.filter((c) =>
        variantMatchesName(c.variant, n),
      );
      if (narrowed.length) pool = narrowed;
    } else if (n.includes("single spike")) {
      const narrowed = pool.filter((c) =>
        variantMatchesName(c.variant, n),
      );
      if (narrowed.length) pool = narrowed;
    } else {
      const singleOnly = pool.filter((c) =>
        normRotationText(c.variant).includes("single"),
      );
      if (singleOnly.length) pool = singleOnly;
    }
  } else if (n.includes("bromeliad")) {
    pool = byGroup("Bromeliads");
  } else if (n.includes("succulent")) {
    pool = byGroup("Succulents");
  } else {
    return fallback;
  }

  if (!pool.length) return fallback;

  const pick = pickRotationEntryForSize(pool, n, sizeInches);
  return pick?.price ?? fallback;
}

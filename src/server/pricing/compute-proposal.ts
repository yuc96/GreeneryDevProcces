import type {
  ItemCategory,
  ProposalItemEntity,
  ProposalLaborLineEntity,
  ProposalLaborLineKey,
} from "../domain";
import { PROPOSAL_LABOR_KEYS } from "../domain";
import type { PricingEngineConfig } from "./engine-schema";

export type LaborLineKey = ProposalLaborLineKey;
export type LaborLineState = ProposalLaborLineEntity;

export interface RotationLineState {
  qty: number;
  frequencyWeeks: 4 | 6 | 8;
  rotationUnitPrice: number;
  truckFee: 25 | 50;
}

export interface ProposalEngineInput {
  items: ProposalItemEntity[];
  rotations: RotationLineState[];
  laborLines: LaborLineState[];
  commissionPct: number;
  commissionBeneficiaries: number;
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

/** Parse inches from strings like '14"' or '(14")' at end of name. */
export function parseSizeInchesFromText(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*["'′″]/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function installMinutesForInches(
  inches: number | null,
  config: PricingEngineConfig,
): number {
  if (inches == null) return config.installMinutesDefault;
  if (
    inches >= config.largeBandMinInches &&
    inches <= config.largeBandMaxInches
  ) {
    return config.installMinutesLargeBand;
  }
  if (
    inches >= config.smallBandMinInches &&
    inches <= config.smallBandMaxInches
  ) {
    return config.installMinutesSmallBand;
  }
  return config.installMinutesDefault;
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

export function computeRotationMonthly(
  line: RotationLineState,
  config: PricingEngineConfig,
): { p1: number; p2: number; p3: number; monthly: number } {
  const { qty, frequencyWeeks, rotationUnitPrice, truckFee } = line;
  const f = frequencyWeeks;
  const p1 = (qty * rotationUnitPrice * f) / 12;
  const p2 = (((qty / config.rotationPlantsPerHour) * f) / 12) * config.hourlyRate;
  const p3 = (((qty / config.rotationPlantsPerHour) * f) / 12) * truckFee;
  return { p1, p2, p3, monthly: p1 + p2 + p3 };
}

export function computeProposal(
  config: PricingEngineConfig,
  input: ProposalEngineInput,
): ComputeProposalResult {
  const totals = {
    plants: { wholesale: 0, retail: 0, freight: 0 },
    pots: { wholesale: 0, retail: 0, freight: 0 },
    materials: { wholesale: 0, retail: 0, freight: 0 },
  };

  let totalInstallMinutes = 0;
  let wholesalePlantsTotal = 0;

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
      wholesalePlantsTotal += effW;
      const inches = parseSizeInchesFromText(item.name);
      const minEach = installMinutesForInches(inches, config);
      totalInstallMinutes += minEach * item.qty;
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
  const tierEvaluationSum = costPerMonthHours + wholesalePlantsTotal;
  const overheadFactor = overheadFactorForSum(tierEvaluationSum, config);
  const overhead =
    (costPerMonthHours + costPerMonthPlants) * overheadFactor;
  const guaranteedMonthlyMaintenance =
    costPerMonthHours + costPerMonthPlants + overhead;

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

export function pickDefaultRotationCatalogPrice(
  plantName: string,
  config: PricingEngineConfig,
): number {
  const n = plantName.toLowerCase();
  const cat = config.rotationCatalog;
  if (n.includes("orchid")) {
    const m = cat.filter((c) => c.group === "Orchids");
    return m[0]?.price ?? 32;
  }
  if (n.includes("bromeliad")) {
    const m = cat.filter((c) => c.group === "Bromeliads");
    return m[0]?.price ?? 17.5;
  }
  if (n.includes("succulent")) {
    const m = cat.filter((c) => c.group === "Succulents");
    return m[0]?.price ?? 10;
  }
  return cat[0]?.price ?? 10;
}

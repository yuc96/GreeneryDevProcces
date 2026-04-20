import type { ProposalLaborLineEntity } from "../domain";
import { PROPOSAL_LABOR_KEYS } from "../domain";
import type {
  ComplexityBand,
  LaborAdjustments,
  LaborAutoConfig,
  LineDistributionPct,
  PricingEngineConfig,
  SimplifiedCountRow,
} from "./engine-schema";
import { parseSizeInchesFromText } from "./compute-proposal";

export interface AutoLaborPlantInput {
  qty: number;
  sizeInches?: number | null;
  /** Optional name (e.g. 'Ficus Lyrata 14"'); used only if sizeInches not set. */
  name?: string | null;
  /** Per-line access/handling adjustments. */
  accessDifficulty?: "easy" | "difficult";
  stairsFloors?: number;
  extraDistanceMeters?: number;
  fragile?: boolean;
}

export interface AutoLaborInput {
  plantItems: AutoLaborPlantInput[];
  /** Drive time one-way in minutes. Null/undefined => use fallback from config. */
  driveMinutesOneWay: number | null | undefined;
  config: PricingEngineConfig;
}

export interface AutoLaborBandBreakdown {
  bandId: string;
  bandLabel: string;
  plantCount: number;
  totalInstallMinutes: number;
}

export interface AutoLaborResult {
  lines: ProposalLaborLineEntity[];
  /** Sum of (per-plant base × adjustment factors × qty). */
  totalInstallMinutes: number;
  /** People needed in parallel = ceil(totalHandlingManMinutes / target). */
  peakPeople: number;
  /**
   * Average clock minutes per person for handling (load/unload/install/cleanUp):
   * total handling person-minutes ÷ crew size (capped by target).
   */
  clockMinutesPerPerson: number;
  /** Configured target (e.g. 60 = 1 hour per person). */
  targetClockMinutesPerPerson: number;
  driveMinutesOneWay: number;
  totalLaborCost: number;
  bands: AutoLaborBandBreakdown[];
}

function matchBand(
  bands: ComplexityBand[],
  inches: number | null,
): ComplexityBand {
  if (inches == null || !Number.isFinite(inches)) {
    return (
      bands.find((b) => b.id === "medium") ??
      bands[Math.min(1, bands.length - 1)] ??
      bands[0]
    );
  }
  for (const b of bands) {
    const low = b.minInches == null ? -Infinity : b.minInches;
    const high = b.maxInches == null ? Infinity : b.maxInches;
    if (inches >= low && inches <= high) return b;
  }
  return bands[bands.length - 1];
}

function adjustmentFactor(
  adj: LaborAdjustments,
  plant: AutoLaborPlantInput,
): { factor: number; extraMinutesPerPlant: number } {
  let factor = 1;
  if (plant.accessDifficulty === "difficult") {
    factor *= adj.difficultAccessFactor;
  }
  const floors = Math.max(0, Math.floor(plant.stairsFloors ?? 0));
  if (floors > 0) {
    factor *= Math.pow(adj.stairsPerFloorFactor, floors);
  }
  if (plant.fragile) {
    factor *= adj.fragileFactor;
  }
  let extra = 0;
  const distance = Math.max(0, Number(plant.extraDistanceMeters ?? 0));
  if (distance > adj.distanceBaselineMeters && adj.distanceStepMeters > 0) {
    const excess = distance - adj.distanceBaselineMeters;
    const steps = Math.ceil(excess / adj.distanceStepMeters);
    extra = steps * adj.distanceExtraMinutes;
  }
  return { factor, extraMinutesPerPlant: extra };
}

function resolveInches(plant: AutoLaborPlantInput): number | null {
  if (
    typeof plant.sizeInches === "number" &&
    Number.isFinite(plant.sizeInches)
  ) {
    return plant.sizeInches;
  }
  if (plant.name) return parseSizeInchesFromText(plant.name);
  return null;
}

/**
 * Resolve drive minutes (handles fallback) and corresponding hours.
 */
function resolveDrive(
  driveMinutesOneWay: number | null | undefined,
  auto: LaborAutoConfig,
): { driveMinutesUsed: number; driveHours: number } {
  const resolvedDrive =
    typeof driveMinutesOneWay === "number" &&
    Number.isFinite(driveMinutesOneWay) &&
    driveMinutesOneWay >= 0
      ? driveMinutesOneWay
      : null;
  const driveHours =
    resolvedDrive != null
      ? resolvedDrive / 60
      : auto.defaultDriveHoursOneWayFallback;
  const driveMinutesUsed =
    resolvedDrive != null ? resolvedDrive : driveHours * 60;
  return { driveMinutesUsed, driveHours };
}

/**
 * Crew size so no person exceeds `targetClockMinutesPerPerson` on **total**
 * handling person-minutes (floors + plant-derived split).
 *
 *   peopleNeeded = max(1, ceil(totalHandlingManMinutes / target))
 *   clockMinutesPerPerson = totalHandlingManMinutes / peopleNeeded
 */
function deriveCrewSize(
  totalManMinutes: number,
  targetClockMinutesPerPerson: number,
): { peopleNeeded: number; clockMinutesPerPerson: number } {
  const target = Math.max(1, targetClockMinutesPerPerson);
  if (totalManMinutes <= 0) {
    return { peopleNeeded: 1, clockMinutesPerPerson: 0 };
  }
  const peopleNeeded = Math.max(1, Math.ceil(totalManMinutes / target));
  const clockMinutesPerPerson = totalManMinutes / peopleNeeded;
  return { peopleNeeded, clockMinutesPerPerson };
}

const HANDLING_LINE_KEYS = [
  "load",
  "unload",
  "install",
  "cleanUp",
] as const;
type HandlingLineKey = (typeof HANDLING_LINE_KEYS)[number];

/**
 * Normalize load/unload/install/cleanUp weights so plant-derived man-minutes
 * split across phases in a stable way (legacy configs often did not sum to 1).
 */
function normalizedHandlingWeights(
  pct: LineDistributionPct,
): Record<HandlingLineKey, number> {
  const raw = {
    load: Math.max(0, pct.load),
    unload: Math.max(0, pct.unload),
    install: Math.max(0, pct.install),
    cleanUp: Math.max(0, pct.cleanUp),
  };
  const sum = raw.load + raw.unload + raw.install + raw.cleanUp;
  if (!(sum > 0)) {
    return {
      load: 0.25,
      unload: 0.25,
      install: 0.4,
      cleanUp: 0.1,
    };
  }
  return {
    load: raw.load / sum,
    unload: raw.unload / sum,
    install: raw.install / sum,
    cleanUp: raw.cleanUp / sum,
  };
}

/** Person-minutes per handling line: floor + (weight × plant man-minutes). */
function handlingManMinutesByKey(
  plantManMinutes: number,
  auto: LaborAutoConfig,
): Record<HandlingLineKey, number> {
  const w = normalizedHandlingWeights(auto.lineDistributionPct);
  const m = auto.handlingMinimumPersonMinutes;
  const out = {} as Record<HandlingLineKey, number>;
  for (const key of HANDLING_LINE_KEYS) {
    out[key] = m[key] + w[key] * plantManMinutes;
  }
  return out;
}

export function computeAutoLaborLines(input: AutoLaborInput): AutoLaborResult {
  const { plantItems, driveMinutesOneWay, config } = input;
  const auto: LaborAutoConfig = config.laborAuto;
  const bands = auto.complexityBands;

  let totalInstallMinutes = 0;
  const breakdownMap = new Map<string, AutoLaborBandBreakdown>();

  for (const it of plantItems) {
    const qty = Math.max(0, Number(it.qty) || 0);
    if (qty <= 0) continue;
    const inches = resolveInches(it);
    const band = matchBand(bands, inches);
    const { factor, extraMinutesPerPlant } = adjustmentFactor(
      auto.adjustments,
      it,
    );
    const minutesPerPlant = band.baseMinutes * factor + extraMinutesPerPlant;
    const lineMinutes = minutesPerPlant * qty;
    totalInstallMinutes += lineMinutes;

    const prev = breakdownMap.get(band.id);
    if (prev) {
      prev.plantCount += qty;
      prev.totalInstallMinutes += lineMinutes;
    } else {
      breakdownMap.set(band.id, {
        bandId: band.id,
        bandLabel: band.label,
        plantCount: qty,
        totalInstallMinutes: lineMinutes,
      });
    }
  }

  const plantManMinutes = totalInstallMinutes;
  const hasPlantWork = plantManMinutes > 0;
  const handlingByKey = hasPlantWork
    ? handlingManMinutesByKey(plantManMinutes, auto)
    : ({
        load: 0,
        unload: 0,
        install: 0,
        cleanUp: 0,
      } as Record<HandlingLineKey, number>);
  const totalHandlingManMinutes = hasPlantWork
    ? HANDLING_LINE_KEYS.reduce((s, k) => s + handlingByKey[k], 0)
    : 0;

  const { peopleNeeded, clockMinutesPerPerson } = deriveCrewSize(
    totalHandlingManMinutes,
    auto.targetClockMinutesPerPerson,
  );
  const driverPeople = Math.max(1, Math.floor(auto.driverPeople));
  const { driveMinutesUsed, driveHours } = resolveDrive(
    driveMinutesOneWay,
    auto,
  );

  const handlingHoursByKey: Record<
    "load" | "unload" | "install" | "cleanUp",
    number
  > = {
    load: 0,
    unload: 0,
    install: 0,
    cleanUp: 0,
  };
  if (hasPlantWork && peopleNeeded > 0) {
    for (const key of HANDLING_LINE_KEYS) {
      handlingHoursByKey[key] = handlingByKey[key] / peopleNeeded / 60;
    }
  }

  const lines: ProposalLaborLineEntity[] = PROPOSAL_LABOR_KEYS.map((key) => {
    if (key === "driveToJob" || key === "driveFromJob") {
      return { key, people: driverPeople, hours: round2(driveHours) };
    }
    return {
      key,
      people: peopleNeeded,
      hours: round2(handlingHoursByKey[key] ?? 0),
    };
  });

  const totalLaborCost = lines.reduce(
    (s, l) => s + l.people * l.hours * config.hourlyRate,
    0,
  );

  const bandsOrder = bands.map((b) => b.id);
  const bands_out: AutoLaborBandBreakdown[] = Array.from(
    breakdownMap.values(),
  )
    .map((b) => ({
      ...b,
      totalInstallMinutes: round2(b.totalInstallMinutes),
    }))
    .sort(
      (a, b) => bandsOrder.indexOf(a.bandId) - bandsOrder.indexOf(b.bandId),
    );

  return {
    lines,
    totalInstallMinutes: round2(totalInstallMinutes),
    peakPeople: peopleNeeded,
    clockMinutesPerPerson: round2(clockMinutesPerPerson),
    targetClockMinutesPerPerson: auto.targetClockMinutesPerPerson,
    driveMinutesOneWay: round2(driveMinutesUsed),
    totalLaborCost: round2(totalLaborCost),
    bands: bands_out,
  };
}

export interface SimplifiedLaborInput {
  plantCount: number;
  driveMinutesOneWay: number | null | undefined;
  config: PricingEngineConfig;
}

export interface SimplifiedLaborResult {
  lines: ProposalLaborLineEntity[];
  row: SimplifiedCountRow;
  /** Total man-hours of install work (count × hoursPerPlant). */
  totalInstallHours: number;
  /** People derived from the target clock-minutes-per-person rule. */
  peakPeople: number;
  /** Average clock minutes per person across handling lines. */
  clockMinutesPerPerson: number;
  driveMinutesOneWay: number;
  totalLaborCost: number;
}

/**
 * Estimation used in the Requirements step before Products is filled. Picks a
 * row from `simplifiedByCount` based on total plant count to estimate man-hours
 * per plant, then applies the same "≤ target clock minutes per person" rule
 * as the detailed engine.
 */
export function computeSimplifiedLabor(
  input: SimplifiedLaborInput,
): SimplifiedLaborResult {
  const { plantCount, driveMinutesOneWay, config } = input;
  const auto = config.laborAuto;
  const count = Math.max(0, Math.floor(plantCount));
  const sorted = [...auto.simplifiedByCount].sort((a, b) => {
    const am = a.maxCount ?? Number.POSITIVE_INFINITY;
    const bm = b.maxCount ?? Number.POSITIVE_INFINITY;
    return am - bm;
  });
  const row =
    sorted.find((r) => r.maxCount != null && count <= r.maxCount) ??
    sorted[sorted.length - 1];

  const totalInstallHours = count * row.hoursPerPlant;
  const plantManMinutes = totalInstallHours * 60;
  const hasPlantWork = count > 0;
  const handlingByKey = hasPlantWork
    ? handlingManMinutesByKey(plantManMinutes, auto)
    : ({
        load: 0,
        unload: 0,
        install: 0,
        cleanUp: 0,
      } as Record<HandlingLineKey, number>);
  const totalHandlingManMinutes = hasPlantWork
    ? HANDLING_LINE_KEYS.reduce((s, k) => s + handlingByKey[k], 0)
    : 0;

  const { peopleNeeded, clockMinutesPerPerson } = deriveCrewSize(
    totalHandlingManMinutes,
    auto.targetClockMinutesPerPerson,
  );
  const driverPeople = Math.max(1, Math.floor(auto.driverPeople));
  const { driveMinutesUsed, driveHours } = resolveDrive(
    driveMinutesOneWay,
    auto,
  );

  const handlingHoursByKey: Record<
    "load" | "unload" | "install" | "cleanUp",
    number
  > = {
    load: 0,
    unload: 0,
    install: 0,
    cleanUp: 0,
  };
  if (hasPlantWork && peopleNeeded > 0) {
    for (const key of HANDLING_LINE_KEYS) {
      handlingHoursByKey[key] = handlingByKey[key] / peopleNeeded / 60;
    }
  }

  const lines: ProposalLaborLineEntity[] = PROPOSAL_LABOR_KEYS.map((key) => {
    if (key === "driveToJob" || key === "driveFromJob") {
      return { key, people: driverPeople, hours: round2(driveHours) };
    }
    return {
      key,
      people: peopleNeeded,
      hours: round2(handlingHoursByKey[key] ?? 0),
    };
  });
  const totalLaborCost = lines.reduce(
    (s, l) => s + l.people * l.hours * config.hourlyRate,
    0,
  );
  return {
    lines,
    row,
    totalInstallHours: round2(totalInstallHours),
    peakPeople: peopleNeeded,
    clockMinutesPerPerson: round2(clockMinutesPerPerson),
    driveMinutesOneWay: round2(driveMinutesUsed),
    totalLaborCost: round2(totalLaborCost),
  };
}

/**
 * Deterministic 0..max simulation of one-way drive minutes from a client id.
 * Used for demo when no Google Maps integration and no manual override exists.
 */
export function simulateDriveMinutes(clientId: string, max: number): number {
  const m = Math.max(0, Math.floor(max));
  if (m === 0 || !clientId) return 0;
  let h = 2166136261;
  for (let i = 0; i < clientId.length; i++) {
    h ^= clientId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const positive = (h >>> 0) % (m + 1);
  return positive;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

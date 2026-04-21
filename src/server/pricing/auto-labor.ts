import type { ProposalLaborLineEntity } from "../domain";
import { PROPOSAL_LABOR_KEYS } from "../domain";
import type {
  LaborAutoConfig,
  LineDistributionPct,
  PricingEngineConfig,
} from "./engine-schema";
import {
  peopleNeededForQtyAndDiameter,
  parseSizeInchesFromText,
  resolveCppForDiameter,
} from "./cpp-model";

export interface AutoLaborPlantInput {
  qty: number;
  sizeInches?: number | null;
  /** Optional name (e.g. 'Ficus Lyrata 14"'); used only if sizeInches not set. */
  name?: string | null;
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
  /** Person-minutes derived from CPP staffing rule. */
  totalInstallMinutes: number;
  /** People needed in parallel (CPP-driven). */
  peakPeople: number;
  /**
   * Average clock minutes per person for handling (load/unload/install/cleanUp):
   * total handling person-minutes ÷ crew size.
   */
  clockMinutesPerPerson: number;
  /** Configured target (e.g. 120 = 2 hours/person). */
  targetClockMinutesPerPerson: number;
  driveMinutesOneWay: number;
  totalLaborCost: number;
  bands: AutoLaborBandBreakdown[];
  fallbackDiameterCount: number;
}

const HANDLING_LINE_KEYS = ["load", "unload", "install", "cleanUp"] as const;
type HandlingLineKey = (typeof HANDLING_LINE_KEYS)[number];

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

/** Resolve drive minutes (handles fallback) and corresponding hours. */
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

function handlingManMinutesByKey(
  totalInstallManMinutes: number,
  auto: LaborAutoConfig,
): Record<HandlingLineKey, number> {
  const w = normalizedHandlingWeights(auto.lineDistributionPct);
  return {
    load: totalInstallManMinutes * w.load,
    unload: totalInstallManMinutes * w.unload,
    install: totalInstallManMinutes * w.install,
    cleanUp: totalInstallManMinutes * w.cleanUp,
  };
}

export function computeAutoLaborLines(input: AutoLaborInput): AutoLaborResult {
  const { plantItems, driveMinutesOneWay, config } = input;
  const auto: LaborAutoConfig = config.laborAuto;
  const target = Math.max(1, auto.targetClockMinutesPerPerson);

  let totalInstallMinutes = 0;
  let fallbackDiameterCount = 0;
  const breakdownMap = new Map<string, AutoLaborBandBreakdown>();

  for (const it of plantItems) {
    const qty = Math.max(0, Number(it.qty) || 0);
    if (qty <= 0) continue;
    const inches = resolveInches(it);
    const cppRes = resolveCppForDiameter(inches, {
      cppByDiameterPoints: auto.cppByDiameterPoints,
      cppInterpolationMode: auto.cppInterpolationMode,
      missingDiameterFallbackCpp: auto.missingDiameterFallbackCpp,
      missingDiameterFallbackMinEmployees:
        auto.missingDiameterFallbackMinEmployees,
      missingDiameterTwoPeopleThresholdQty:
        auto.missingDiameterTwoPeopleThresholdQty,
    });
    if (cppRes.usedFallbackDiameter) {
      fallbackDiameterCount += qty;
    }
    const peopleForLine = peopleNeededForQtyAndDiameter(qty, inches, {
      cppByDiameterPoints: auto.cppByDiameterPoints,
      cppInterpolationMode: auto.cppInterpolationMode,
      missingDiameterFallbackCpp: auto.missingDiameterFallbackCpp,
      missingDiameterFallbackMinEmployees:
        auto.missingDiameterFallbackMinEmployees,
      missingDiameterTwoPeopleThresholdQty:
        auto.missingDiameterTwoPeopleThresholdQty,
    });
    const lineMinutes = peopleForLine * target;
    totalInstallMinutes += lineMinutes;

    const prev = breakdownMap.get(cppRes.bandId);
    if (prev) {
      prev.plantCount += qty;
      prev.totalInstallMinutes += lineMinutes;
    } else {
      breakdownMap.set(cppRes.bandId, {
        bandId: cppRes.bandId,
        bandLabel: cppRes.bandLabel,
        plantCount: qty,
        totalInstallMinutes: lineMinutes,
      });
    }
  }

  const hasPlantWork = totalInstallMinutes > 0;
  const handlingByKey = hasPlantWork
    ? handlingManMinutesByKey(totalInstallMinutes, auto)
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
    target,
  );
  const driverPeople = 1;
  const { driveMinutesUsed, driveHours } = resolveDrive(
    driveMinutesOneWay,
    auto,
  );

  const handlingHoursByKey: Record<HandlingLineKey, number> = {
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

  const bandsOut: AutoLaborBandBreakdown[] = Array.from(
    breakdownMap.values(),
  )
    .map((b) => ({
      ...b,
      totalInstallMinutes: round2(b.totalInstallMinutes),
    }))
    .sort((a, b) => a.bandLabel.localeCompare(b.bandLabel));

  return {
    lines,
    totalInstallMinutes: round2(totalInstallMinutes),
    peakPeople: peopleNeeded,
    clockMinutesPerPerson: round2(clockMinutesPerPerson),
    targetClockMinutesPerPerson: target,
    driveMinutesOneWay: round2(driveMinutesUsed),
    totalLaborCost: round2(totalLaborCost),
    bands: bandsOut,
    fallbackDiameterCount,
  };
}

export interface SimplifiedLaborInput {
  plantCount: number;
  driveMinutesOneWay: number | null | undefined;
  config: PricingEngineConfig;
}

export interface SimplifiedLaborResult {
  lines: ProposalLaborLineEntity[];
  /** Total install workload used by CPP fallback in hours. */
  totalInstallHours: number;
  /** People derived from the CPP fallback rule. */
  peakPeople: number;
  /** Average clock minutes per person across handling lines. */
  clockMinutesPerPerson: number;
  driveMinutesOneWay: number;
  totalLaborCost: number;
  fallbackDiameterCount: number;
}

/**
 * Requirements-step estimation: without reliable per-item diameter at this
 * point, apply the conservative fallback CPP for all plants.
 */
export function computeSimplifiedLabor(
  input: SimplifiedLaborInput,
): SimplifiedLaborResult {
  const { plantCount, driveMinutesOneWay, config } = input;
  const auto = config.laborAuto;
  const count = Math.max(0, Math.floor(plantCount));
  const target = Math.max(1, auto.targetClockMinutesPerPerson);
  const peopleNeeded = peopleNeededForQtyAndDiameter(count, null, {
    cppByDiameterPoints: auto.cppByDiameterPoints,
    cppInterpolationMode: auto.cppInterpolationMode,
    missingDiameterFallbackCpp: auto.missingDiameterFallbackCpp,
    missingDiameterFallbackMinEmployees: auto.missingDiameterFallbackMinEmployees,
    missingDiameterTwoPeopleThresholdQty:
      auto.missingDiameterTwoPeopleThresholdQty,
  });
  const totalInstallMinutes = count > 0 ? peopleNeeded * target : 0;
  const totalInstallHours = totalInstallMinutes / 60;
  const handlingByKey = totalInstallMinutes
    ? handlingManMinutesByKey(totalInstallMinutes, auto)
    : ({
        load: 0,
        unload: 0,
        install: 0,
        cleanUp: 0,
      } as Record<HandlingLineKey, number>);
  const totalHandlingManMinutes = totalInstallMinutes
    ? HANDLING_LINE_KEYS.reduce((s, k) => s + handlingByKey[k], 0)
    : 0;
  const clockMinutesPerPerson =
    peopleNeeded > 0 ? totalHandlingManMinutes / peopleNeeded : 0;

  const driverPeople = 1;
  const { driveMinutesUsed, driveHours } = resolveDrive(
    driveMinutesOneWay,
    auto,
  );

  const handlingHoursByKey: Record<HandlingLineKey, number> = {
    load: 0,
    unload: 0,
    install: 0,
    cleanUp: 0,
  };
  if (totalInstallMinutes && peopleNeeded > 0) {
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
    totalInstallHours: round2(totalInstallHours),
    peakPeople: peopleNeeded,
    clockMinutesPerPerson: round2(clockMinutesPerPerson),
    driveMinutesOneWay: round2(driveMinutesUsed),
    totalLaborCost: round2(totalLaborCost),
    fallbackDiameterCount: count,
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

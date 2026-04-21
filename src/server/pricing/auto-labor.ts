import type { ProposalLaborLineEntity } from "../domain";
import type { LaborEngineConfig } from "./labor-engine-schema";
import type { PricingEngineConfig } from "./engine-schema";
import { parseSizeInchesFromText } from "./cpp-model";
import { inchesToLaborPlantSize } from "./labor-engine/sizes";
import {
  laborMaterialTypeFromStagingSourceId,
  stagingSourceIdFromCatalogId,
} from "./labor-engine/staging-material-map";
import type { MaterialBulkRow, PlantQtyRow } from "./labor-engine/pwu";
import {
  estimateLaborLinesCore,
  type LaborDriveLegsInput,
} from "./labor-engine/estimate-sync";
import { enforceMinHours } from "./labor-engine/hours";
import type { PeopleRuleId } from "./labor-engine/people";

export interface AutoLaborPlantInput {
  qty: number;
  sizeInches?: number | null;
  name?: string | null;
}

export interface AutoLaborPotInput {
  qty: number;
  sizeInches?: number | null;
  name?: string | null;
}

export interface AutoLaborStagingInput {
  catalogId: string;
  qty: number;
}

export interface AutoLaborDriveLegsInput {
  toJobHours: number;
  fromJobHours: number;
  mapsApiFallbackUsed: boolean;
}

export interface AutoLaborInput {
  plantItems: AutoLaborPlantInput[];
  potItems?: AutoLaborPotInput[];
  stagingItems?: AutoLaborStagingInput[];
  driveMinutesOneWay: number | null | undefined;
  /** When set (e.g. from `/api/labor-drive`), overrides symmetric minutes. */
  driveLegs?: AutoLaborDriveLegsInput | null;
  config: PricingEngineConfig;
  laborConfig: LaborEngineConfig;
}

export interface AutoLaborBandBreakdown {
  bandId: string;
  bandLabel: string;
  plantCount: number;
  totalInstallMinutes: number;
}

export interface AutoLaborResult {
  lines: ProposalLaborLineEntity[];
  /** One-person install minutes (sum qty × minutes per size). */
  totalInstallMinutes: number;
  peakPeople: number;
  /** Wall-clock minutes per person for load+unload+install+cleanUp (sequential sum). */
  clockMinutesPerPerson: number;
  /** Legacy field from pricing config (CPP era); shown only for admin compatibility. */
  targetClockMinutesPerPerson: number;
  /** Average one-way drive minutes (mean of to-job and from-job). */
  driveMinutesOneWay: number;
  totalLaborCost: number;
  bands: AutoLaborBandBreakdown[];
  /** Plant units that relied on fallback pot size (no diameter). */
  fallbackDiameterCount: number;
  pwuLoadUnload: number;
  pwuInstall: number;
  peopleAssignmentRuleMatched: PeopleRuleId;
  mapsApiFallbackUsed: boolean;
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

function resolvePotInches(pot: AutoLaborPotInput): number | null {
  if (
    typeof pot.sizeInches === "number" &&
    Number.isFinite(pot.sizeInches)
  ) {
    return pot.sizeInches;
  }
  if (pot.name) return parseSizeInchesFromText(pot.name);
  return null;
}

function buildPlantRows(
  items: AutoLaborPlantInput[],
  laborCfg: LaborEngineConfig,
): { rows: PlantQtyRow[]; fallbackDiameterCount: number } {
  const rows: PlantQtyRow[] = [];
  let fallbackDiameterCount = 0;
  for (const it of items) {
    const qty = Math.max(0, Number(it.qty) || 0);
    if (qty <= 0) continue;
    const inches = resolveInches(it);
    const { size, usedFallback } = inchesToLaborPlantSize(
      inches,
      laborCfg.simplifiedFallbackPlantSize,
    );
    if (usedFallback) {
      fallbackDiameterCount += qty;
    }
    rows.push({ size, quantity: qty });
  }
  return { rows, fallbackDiameterCount };
}

function buildPotRows(
  items: AutoLaborPotInput[] | undefined,
  laborCfg: LaborEngineConfig,
): PlantQtyRow[] {
  if (!items?.length) return [];
  const rows: PlantQtyRow[] = [];
  for (const it of items) {
    const qty = Math.max(0, Number(it.qty) || 0);
    if (qty <= 0) continue;
    const inches = resolvePotInches(it);
    const { size } = inchesToLaborPlantSize(
      inches,
      laborCfg.simplifiedFallbackPlantSize,
    );
    rows.push({ size, quantity: qty });
  }
  return rows;
}

function aggregateMaterials(
  items: AutoLaborStagingInput[] | undefined,
): MaterialBulkRow[] {
  if (!items?.length) return [];
  const map = new Map<string, number>();
  for (const it of items) {
    const qty = Math.max(0, Number(it.qty) || 0);
    if (qty <= 0) continue;
    const sid = stagingSourceIdFromCatalogId(it.catalogId);
    if (sid == null) continue;
    const t = laborMaterialTypeFromStagingSourceId(sid);
    map.set(t, (map.get(t) ?? 0) + qty);
  }
  return [...map.entries()].map(([type, estimatedBulks]) => ({
    type: type as MaterialBulkRow["type"],
    estimatedBulks,
  })) as MaterialBulkRow[];
}

function resolveDriveInput(
  driveLegs: AutoLaborDriveLegsInput | null | undefined,
  driveMinutesOneWay: number | null | undefined,
  laborCfg: LaborEngineConfig,
  pricingCfg: PricingEngineConfig,
): LaborDriveLegsInput {
  if (
    driveLegs &&
    Number.isFinite(driveLegs.toJobHours) &&
    Number.isFinite(driveLegs.fromJobHours)
  ) {
    return {
      toJobHours: enforceMinHours(driveLegs.toJobHours, laborCfg.MIN_HOURS),
      fromJobHours: enforceMinHours(driveLegs.fromJobHours, laborCfg.MIN_HOURS),
      mapsApiFallbackUsed: Boolean(driveLegs.mapsApiFallbackUsed),
    };
  }
  const resolvedMin =
    typeof driveMinutesOneWay === "number" &&
    Number.isFinite(driveMinutesOneWay) &&
    driveMinutesOneWay >= 0
      ? driveMinutesOneWay
      : null;
  const hoursOneWay =
    resolvedMin != null
      ? enforceMinHours(resolvedMin / 60, laborCfg.MIN_HOURS)
      : enforceMinHours(
          laborCfg.defaultDriveHoursOneWayFallback > 0
            ? laborCfg.defaultDriveHoursOneWayFallback
            : pricingCfg.laborAuto.defaultDriveHoursOneWayFallback,
          laborCfg.MIN_HOURS,
        );
  return {
    toJobHours: hoursOneWay,
    fromJobHours: hoursOneWay,
    mapsApiFallbackUsed: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeAutoLaborLines(input: AutoLaborInput): AutoLaborResult {
  const {
    plantItems,
    potItems,
    stagingItems,
    driveMinutesOneWay,
    driveLegs,
    config,
    laborConfig,
  } = input;

  const { rows: plants, fallbackDiameterCount } = buildPlantRows(
    plantItems,
    laborConfig,
  );
  const pots = buildPotRows(potItems, laborConfig);
  const materials = aggregateMaterials(stagingItems);

  const drive = resolveDriveInput(
    driveLegs ?? null,
    driveMinutesOneWay,
    laborConfig,
    config,
  );

  const core = estimateLaborLinesCore(
    { plants, pots, materials, drive },
    laborConfig,
  );

  const wallSequential = core.lines
    .filter((l) => ["load", "unload", "install", "cleanUp"].includes(l.key))
    .reduce((s, l) => s + (l.people > 0 ? l.hours : 0), 0);
  const clockMin = wallSequential * 60;

  const totalLaborCost = core.lines.reduce(
    (s, l) => s + l.people * l.hours * config.hourlyRate,
    0,
  );

  const driveAvgMin =
    ((drive.toJobHours + drive.fromJobHours) / 2) * 60;

  return {
    lines: core.lines,
    totalInstallMinutes: round2(core.totalInstallMinutesOnePerson),
    peakPeople: core.teamSize,
    clockMinutesPerPerson: round2(clockMin),
    targetClockMinutesPerPerson: config.laborAuto.targetClockMinutesPerPerson,
    driveMinutesOneWay: round2(driveAvgMin),
    totalLaborCost: round2(totalLaborCost),
    bands: [],
    fallbackDiameterCount,
    pwuLoadUnload: round2(core.pwuLoadUnload),
    pwuInstall: round2(core.pwuInstall),
    peopleAssignmentRuleMatched: core.peopleAssignmentRuleMatched,
    mapsApiFallbackUsed: core.mapsApiFallbackUsed,
  };
}

export interface SimplifiedLaborPlantLineInput {
  qty: number;
  sizeInches?: number | null;
  name?: string | null;
}

export interface SimplifiedLaborInput {
  /** Used when `plantLines` is absent: all units at fallback pot size. */
  plantCount: number;
  plantLines?: SimplifiedLaborPlantLineInput[];
  driveMinutesOneWay: number | null | undefined;
  driveLegs?: AutoLaborDriveLegsInput | null;
  config: PricingEngineConfig;
  laborConfig: LaborEngineConfig;
}

export interface SimplifiedLaborResult {
  lines: ProposalLaborLineEntity[];
  totalInstallHours: number;
  peakPeople: number;
  clockMinutesPerPerson: number;
  driveMinutesOneWay: number;
  totalLaborCost: number;
  fallbackDiameterCount: number;
  pwuLoadUnload: number;
  pwuInstall: number;
  peopleAssignmentRuleMatched: PeopleRuleId;
  mapsApiFallbackUsed: boolean;
}

export function computeSimplifiedLabor(
  input: SimplifiedLaborInput,
): SimplifiedLaborResult {
  const plantItems: AutoLaborPlantInput[] =
    input.plantLines && input.plantLines.length > 0
      ? input.plantLines.map((r) => ({
          qty: Math.max(0, Number(r.qty) || 0),
          sizeInches: r.sizeInches,
          name: r.name,
        }))
      : [
          {
            qty: Math.max(0, Math.floor(input.plantCount)),
            sizeInches: null,
            name: null,
          },
        ];

  const full = computeAutoLaborLines({
    plantItems,
    potItems: [],
    stagingItems: [],
    driveMinutesOneWay: input.driveMinutesOneWay,
    driveLegs: input.driveLegs,
    config: input.config,
    laborConfig: input.laborConfig,
  });

  return {
    lines: full.lines,
    totalInstallHours: round2(full.totalInstallMinutes / 60),
    peakPeople: full.peakPeople,
    clockMinutesPerPerson: full.clockMinutesPerPerson,
    driveMinutesOneWay: full.driveMinutesOneWay,
    totalLaborCost: full.totalLaborCost,
    fallbackDiameterCount: full.fallbackDiameterCount,
    pwuLoadUnload: full.pwuLoadUnload,
    pwuInstall: full.pwuInstall,
    peopleAssignmentRuleMatched: full.peopleAssignmentRuleMatched,
    mapsApiFallbackUsed: full.mapsApiFallbackUsed,
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

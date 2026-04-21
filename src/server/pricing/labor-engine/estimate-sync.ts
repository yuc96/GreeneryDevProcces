import type { ProposalLaborLineEntity } from "../../domain";
import { PROPOSAL_LABOR_KEYS } from "../../domain";
import type { LaborEngineConfig } from "../labor-engine-schema";
import { determinePeopleForInstall } from "./people";
import type { PeopleRuleId } from "./people";
import { enforceMinHours } from "./hours";
import type { MaterialBulkRow, PlantQtyRow } from "./pwu";
import {
  totalInstallMinutesPlants,
  totalPwuLoadUnload,
} from "./pwu";

export interface LaborDriveLegsInput {
  toJobHours: number;
  fromJobHours: number;
  mapsApiFallbackUsed: boolean;
}

export interface LaborEstimateCoreInput {
  plants: PlantQtyRow[];
  pots: PlantQtyRow[];
  materials: MaterialBulkRow[];
  drive: LaborDriveLegsInput;
}

export interface LaborEstimateCoreResult {
  lines: ProposalLaborLineEntity[];
  pwuLoadUnload: number;
  pwuInstall: number;
  /** Same headcount on every line that has work (per spec). */
  teamSize: number;
  peopleAssignmentRuleMatched: PeopleRuleId;
  mapsApiFallbackUsed: boolean;
  /** Sum of qty × install minutes per plant (1-person work content). */
  totalInstallMinutesOnePerson: number;
  lineReasoning: Record<ProposalLaborLineEntity["key"], string>;
}

function hasPlantQty(plants: PlantQtyRow[]): boolean {
  return plants.some((p) => Math.max(0, p.quantity) > 0);
}

function hasLoadUnloadQty(
  plants: PlantQtyRow[],
  pots: PlantQtyRow[],
  materials: MaterialBulkRow[],
): boolean {
  if (plants.some((p) => Math.max(0, p.quantity) > 0)) return true;
  if (pots.some((p) => Math.max(0, p.quantity) > 0)) return true;
  if (materials.some((m) => Math.max(0, m.estimatedBulks) > 0)) return true;
  return false;
}

export function estimateLaborLinesCore(
  input: LaborEstimateCoreInput,
  laborCfg: LaborEngineConfig,
): LaborEstimateCoreResult {
  const { plants, pots, materials, drive } = input;
  const minH = laborCfg.MIN_HOURS;
  const pwuLu = totalPwuLoadUnload(plants, pots, materials, laborCfg);
  const pwuInst = plants.reduce(
    (s, p) => s + Math.max(0, p.quantity) * laborCfg.PWU_PLANTS_INSTALL[p.size],
    0,
  );
  const totalInstallMin = totalInstallMinutesPlants(plants, laborCfg);

  const { people: teamSize, ruleMatched } = determinePeopleForInstall(
    plants,
    laborCfg,
  );

  const reasoning = {} as LaborEstimateCoreResult["lineReasoning"];

  const driveToH = enforceMinHours(drive.toJobHours, minH);
  const driveFromH = enforceMinHours(drive.fromJobHours, minH);

  let hoursLoad = 0;
  let hoursUnload = 0;
  let hoursInstall = 0;
  let hoursClean = 0;

  if (hasLoadUnloadQty(plants, pots, materials)) {
    const rawLoad =
      pwuLu / (laborCfg.PRODUCTIVITY_LOAD_PWU_PER_PERSON_HOUR * teamSize);
    hoursLoad = enforceMinHours(rawLoad, minH);
    reasoning.load = `${pwuLu.toFixed(2)} PWU / (${laborCfg.PRODUCTIVITY_LOAD_PWU_PER_PERSON_HOUR} × ${teamSize} pers.)`;

    const rawUn =
      pwuLu /
      (laborCfg.PRODUCTIVITY_UNLOAD_PWU_PER_PERSON_HOUR * teamSize);
    hoursUnload = enforceMinHours(rawUn, minH);
    reasoning.unload = `${pwuLu.toFixed(2)} PWU / (${laborCfg.PRODUCTIVITY_UNLOAD_PWU_PER_PERSON_HOUR} × ${teamSize} pers.)`;
  } else {
    reasoning.load = "No load/unload workload.";
    reasoning.unload = "No load/unload workload.";
  }

  if (hasPlantQty(plants)) {
    const baseH = totalInstallMin / 60 / teamSize;
    hoursInstall = enforceMinHours(baseH, minH);
    reasoning.install = `${totalInstallMin.toFixed(0)} min install / 60 / ${teamSize} pers.`;

    const cleanupMin =
      laborCfg.CLEANUP_BASE_MINUTES + laborCfg.CLEANUP_MINUTES_PER_PWU * pwuInst;
    const rawCleanH = cleanupMin / 60 / teamSize;
    hoursClean = enforceMinHours(rawCleanH, minH);
    reasoning.cleanUp = `${laborCfg.CLEANUP_BASE_MINUTES} + ${laborCfg.CLEANUP_MINUTES_PER_PWU}×${pwuInst.toFixed(1)} PWU install → ${cleanupMin.toFixed(1)} min / ${teamSize} pers.`;
  } else {
    reasoning.install = "No plants — no install time.";
    reasoning.cleanUp = "No plants — no install cleanup basis.";
  }

  reasoning.driveToJob = drive.mapsApiFallbackUsed
    ? `Maps fallback (${laborCfg.DRIVE_TIME_FALLBACK_HOURS}h) — ${driveToH}h billed.`
    : `Traffic-aware drive ${driveToH}h (quarters).`;
  reasoning.driveFromJob = drive.mapsApiFallbackUsed
    ? `Maps fallback — ${driveFromH}h billed.`
    : `Return leg ${driveFromH}h (quarters).`;

  const anySiteWork =
    hasPlantQty(plants) || hasLoadUnloadQty(plants, pots, materials);
  const headcount = anySiteWork ? teamSize : 1;

  const lines: ProposalLaborLineEntity[] = PROPOSAL_LABOR_KEYS.map((key) => {
    if (key === "driveToJob") {
      return { key, people: headcount, hours: driveToH };
    }
    if (key === "driveFromJob") {
      return { key, people: headcount, hours: driveFromH };
    }
    const people =
      key === "load" || key === "unload"
        ? hasLoadUnloadQty(plants, pots, materials)
          ? headcount
          : 0
        : key === "install" || key === "cleanUp"
          ? hasPlantQty(plants)
            ? headcount
            : 0
          : headcount;
    const hours =
      key === "load"
        ? hoursLoad
        : key === "unload"
          ? hoursUnload
          : key === "install"
            ? hoursInstall
            : hoursClean;
    return { key, people, hours: people > 0 ? hours : 0 };
  });

  return {
    lines,
    pwuLoadUnload: pwuLu,
    pwuInstall: pwuInst,
    teamSize: headcount,
    peopleAssignmentRuleMatched: hasPlantQty(plants)
      ? ruleMatched
      : ("default_1_person" as PeopleRuleId),
    mapsApiFallbackUsed: drive.mapsApiFallbackUsed,
    totalInstallMinutesOnePerson: totalInstallMin,
    lineReasoning: reasoning,
  };
}

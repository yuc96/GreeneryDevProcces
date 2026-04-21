import type {
  LaborEngineConfig,
  LaborMaterialType,
  LaborPlantSize,
} from "../labor-engine-schema";

export interface PlantQtyRow {
  size: LaborPlantSize;
  quantity: number;
}

export interface MaterialBulkRow {
  type: LaborMaterialType;
  estimatedBulks: number;
}

export function sumPwuPlantsLoadUnload(
  plants: PlantQtyRow[],
  cfg: LaborEngineConfig,
): number {
  let s = 0;
  for (const p of plants) {
    const q = Math.max(0, p.quantity);
    if (q <= 0) continue;
    s += q * cfg.PWU_PLANTS_LOAD_UNLOAD[p.size];
  }
  return s;
}

export function sumPwuPlantsInstall(
  plants: PlantQtyRow[],
  cfg: LaborEngineConfig,
): number {
  let s = 0;
  for (const p of plants) {
    const q = Math.max(0, p.quantity);
    if (q <= 0) continue;
    s += q * cfg.PWU_PLANTS_INSTALL[p.size];
  }
  return s;
}

export function sumPwuPotsLoadUnload(
  pots: PlantQtyRow[],
  cfg: LaborEngineConfig,
): number {
  let s = 0;
  for (const p of pots) {
    const q = Math.max(0, p.quantity);
    if (q <= 0) continue;
    s += q * cfg.PWU_POTS_LOAD_UNLOAD[p.size];
  }
  return s;
}

export function sumPwuMaterialsLoadUnload(
  materials: MaterialBulkRow[],
  cfg: LaborEngineConfig,
): number {
  let s = 0;
  for (const m of materials) {
    const b = Math.max(0, m.estimatedBulks);
    if (b <= 0) continue;
    s += b * cfg.PWU_MATERIALS_PER_BULK[m.type];
  }
  return s;
}

export function totalPwuLoadUnload(
  plants: PlantQtyRow[],
  pots: PlantQtyRow[],
  materials: MaterialBulkRow[],
  cfg: LaborEngineConfig,
): number {
  return (
    sumPwuPlantsLoadUnload(plants, cfg) +
    sumPwuPotsLoadUnload(pots, cfg) +
    sumPwuMaterialsLoadUnload(materials, cfg)
  );
}

export function totalInstallMinutesPlants(
  plants: PlantQtyRow[],
  cfg: LaborEngineConfig,
): number {
  let s = 0;
  for (const p of plants) {
    const q = Math.max(0, p.quantity);
    if (q <= 0) continue;
    s += q * cfg.INSTALL_MINUTES_PER_PLANT[p.size];
  }
  return s;
}

import { z } from "zod";

export const laborPlantSizeSchema = z.enum([
  `4"`,
  `6"`,
  `8"`,
  `12"`,
  `14"`,
  `17"`,
  `21"`,
  `24"`,
]);

export type LaborPlantSize = z.infer<typeof laborPlantSizeSchema>;

export const laborMaterialTypeSchema = z.enum([
  "hard_foam",
  "soft_foam",
  "moss",
  "dirt",
  "mulch",
  "gravel",
  "decorative_stone",
]);

export type LaborMaterialType = z.infer<typeof laborMaterialTypeSchema>;

const sizeMapSchema = z.object({
  [`4"`]: z.number(),
  [`6"`]: z.number(),
  [`8"`]: z.number(),
  [`12"`]: z.number(),
  [`14"`]: z.number(),
  [`17"`]: z.number(),
  [`21"`]: z.number(),
  [`24"`]: z.number(),
});

const materialPwuSchema = z.object({
  hard_foam: z.number(),
  soft_foam: z.number(),
  moss: z.number(),
  dirt: z.number(),
  mulch: z.number(),
  gravel: z.number(),
  decorative_stone: z.number(),
});

export const laborEngineConfigSchema = z.object({
  /** @deprecated Use pricing hourlyRate for billing; kept for documentation parity. */
  HOURLY_RATE: z.number().positive().optional(),
  PWU_PLANTS_LOAD_UNLOAD: sizeMapSchema,
  PWU_PLANTS_INSTALL: sizeMapSchema,
  PWU_POTS_LOAD_UNLOAD: sizeMapSchema,
  PWU_MATERIALS_PER_BULK: materialPwuSchema,
  INSTALL_MINUTES_PER_PLANT: sizeMapSchema,
  PRODUCTIVITY_LOAD_PWU_PER_PERSON_HOUR: z.number().positive(),
  PRODUCTIVITY_UNLOAD_PWU_PER_PERSON_HOUR: z.number().positive(),
  CLEANUP_BASE_MINUTES: z.number().min(0),
  CLEANUP_MINUTES_PER_PWU: z.number().min(0),
  PEOPLE_RULES: z.object({
    largeSizesRequireTwo: z.array(laborPlantSizeSchema),
    threshold14Inch: z.number().int().min(0),
    threshold12Inch: z.number().int().min(0),
    thresholdSmallPlants: z.number().int().min(0),
  }),
  MIN_HOURS: z.number().positive(),
  MAX_PEOPLE: z.number().int().min(1).max(8),
  DRIVE_TIME_FALLBACK_HOURS: z.number().positive(),
  MAPS_CACHE_TTL_HOURS: z.number().positive(),
  /** When diameter is unknown (requirements preview), assume this pot size for PWU/install. */
  simplifiedFallbackPlantSize: laborPlantSizeSchema,
  /** One-way drive hours when no minutes, no Maps, and no address pair. */
  defaultDriveHoursOneWayFallback: z.number().min(0),
});

export type LaborEngineConfig = z.infer<typeof laborEngineConfigSchema>;

export const DEFAULT_LABOR_ENGINE_CONFIG: LaborEngineConfig = {
  PWU_PLANTS_LOAD_UNLOAD: {
    [`4"`]: 0.8,
    [`6"`]: 1.0,
    [`8"`]: 1.2,
    [`12"`]: 1.5,
    [`14"`]: 2.5,
    [`17"`]: 4.0,
    [`21"`]: 6.0,
    [`24"`]: 8.0,
  },
  PWU_PLANTS_INSTALL: {
    [`4"`]: 0.8,
    [`6"`]: 1.0,
    [`8"`]: 1.3,
    [`12"`]: 1.8,
    [`14"`]: 3.0,
    [`17"`]: 5.0,
    [`21"`]: 7.0,
    [`24"`]: 9.0,
  },
  PWU_POTS_LOAD_UNLOAD: {
    [`4"`]: 0.5,
    [`6"`]: 0.7,
    [`8"`]: 1.0,
    [`12"`]: 1.5,
    [`14"`]: 3.0,
    [`17"`]: 5.0,
    [`21"`]: 7.0,
    [`24"`]: 10.0,
  },
  PWU_MATERIALS_PER_BULK: {
    hard_foam: 0.3,
    soft_foam: 0.2,
    moss: 0.4,
    dirt: 0.8,
    mulch: 0.8,
    gravel: 1.2,
    decorative_stone: 1.5,
  },
  INSTALL_MINUTES_PER_PLANT: {
    [`4"`]: 1,
    [`6"`]: 1,
    [`8"`]: 1,
    [`12"`]: 2,
    [`14"`]: 2,
    [`17"`]: 4,
    [`21"`]: 6,
    [`24"`]: 8,
  },
  PRODUCTIVITY_LOAD_PWU_PER_PERSON_HOUR: 25,
  PRODUCTIVITY_UNLOAD_PWU_PER_PERSON_HOUR: 30,
  CLEANUP_BASE_MINUTES: 15,
  CLEANUP_MINUTES_PER_PWU: 0.3,
  PEOPLE_RULES: {
    largeSizesRequireTwo: [`17"`, `21"`, `24"`],
    threshold14Inch: 20,
    threshold12Inch: 30,
    thresholdSmallPlants: 50,
  },
  MIN_HOURS: 0.25,
  MAX_PEOPLE: 4,
  DRIVE_TIME_FALLBACK_HOURS: 0.75,
  MAPS_CACHE_TTL_HOURS: 6,
  simplifiedFallbackPlantSize: `6"`,
  defaultDriveHoursOneWayFallback: 0.5,
};

function deepMergeLabor<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>,
): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMergeLabor(
        out[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

const SIZE_MAP_KEYS = [
  "PWU_PLANTS_LOAD_UNLOAD",
  "PWU_PLANTS_INSTALL",
  "PWU_POTS_LOAD_UNLOAD",
  "INSTALL_MINUTES_PER_PLANT",
] as const;

/** Maps legacy 10″/20″ buckets to canonical 12″/21″ after merge. */
function migrateLegacyLaborBuckets(merged: Record<string, unknown>): void {
  for (const key of SIZE_MAP_KEYS) {
    const block = merged[key];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const m = block as Record<string, unknown>;
    if (`10"` in m) {
      m[`12"`] = m[`10"`];
      delete m[`10"`];
    }
    if (`20"` in m) {
      m[`21"`] = m[`20"`];
      delete m[`20"`];
    }
  }
  const rules = merged.PEOPLE_RULES;
  if (rules && typeof rules === "object" && !Array.isArray(rules)) {
    const r = rules as Record<string, unknown>;
    if ("threshold10Inch" in r) {
      const legacy = r.threshold10Inch;
      if (typeof legacy === "number") {
        r.threshold12Inch = legacy;
      }
      delete r.threshold10Inch;
    }
    if (Array.isArray(r.largeSizesRequireTwo)) {
      r.largeSizesRequireTwo = (r.largeSizesRequireTwo as unknown[]).map((x) =>
        x === `20"` ? `21"` : x === `10"` ? `12"` : x,
      );
    }
  }
  if (merged.simplifiedFallbackPlantSize === `10"`) {
    merged.simplifiedFallbackPlantSize = `12"`;
  }
  if (merged.simplifiedFallbackPlantSize === `20"`) {
    merged.simplifiedFallbackPlantSize = `21"`;
  }
}

export function mergeWithLaborDefaults(
  partial: unknown,
): LaborEngineConfig {
  const raw =
    partial && typeof partial === "object"
      ? (partial as Record<string, unknown>)
      : {};
  const merged = deepMergeLabor(
    DEFAULT_LABOR_ENGINE_CONFIG as unknown as Record<string, unknown>,
    raw,
  );
  migrateLegacyLaborBuckets(merged);
  return laborEngineConfigSchema.parse(merged);
}

export function parseLaborEngineConfig(json: unknown): LaborEngineConfig {
  return mergeWithLaborDefaults(json);
}

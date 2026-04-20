import { z } from "zod";

export const PROPOSAL_LABOR_LINE_KEYS = [
  "load",
  "driveToJob",
  "unload",
  "install",
  "cleanUp",
  "driveFromJob",
] as const;

export const laborCrewMapSchema = z.object({
  load: z.number().int().min(0),
  driveToJob: z.number().int().min(0),
  unload: z.number().int().min(0),
  install: z.number().int().min(0),
  cleanUp: z.number().int().min(0),
  driveFromJob: z.number().int().min(0),
});

export type LaborCrewMap = z.infer<typeof laborCrewMapSchema>;

/** Complexity band (size class) used by the detailed auto-labor engine. */
export const complexityBandSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Lower bound in inches (inclusive). null == no lower bound. */
  minInches: z.number().nullable(),
  /** Upper bound in inches (inclusive). null == no upper bound. */
  maxInches: z.number().nullable(),
  /** Base minutes per plant for install handling. */
  baseMinutes: z.number().min(0),
  /**
   * LEGACY — no longer used by the engine. Crew size is now derived from
   * `targetClockMinutesPerPerson`. Kept optional so old configs still parse.
   */
  people: z.number().int().min(1).optional(),
});

export type ComplexityBand = z.infer<typeof complexityBandSchema>;

export const laborAdjustmentsSchema = z.object({
  /** Multiplier applied when access.difficulty is "difficult". */
  difficultAccessFactor: z.number().min(1),
  /** Multiplier applied per extra floor above ground (stairs/elevator). */
  stairsPerFloorFactor: z.number().min(1),
  /** Meters above this threshold count as "extra distance". */
  distanceBaselineMeters: z.number().min(0),
  /** Every N meters over baseline adds `distanceExtraMinutes`. */
  distanceStepMeters: z.number().min(1),
  /** Minutes added per distance step beyond baseline. */
  distanceExtraMinutes: z.number().min(0),
  /** Multiplier applied when fragile=true. */
  fragileFactor: z.number().min(1),
});

export type LaborAdjustments = z.infer<typeof laborAdjustmentsSchema>;

/**
 * Relative weights for splitting **plant-derived** install man-minutes across
 * load, unload, install, and cleanUp. Values are normalized to sum to 1.
 * `driveToJob` / `driveFromJob` are ignored by the labor engine (drive time
 * comes from route / fallback hours).
 */
export const lineDistributionPctSchema = z.object({
  load: z.number().min(0).max(1),
  driveToJob: z.number().min(0).max(1),
  unload: z.number().min(0).max(1),
  install: z.number().min(0).max(1),
  cleanUp: z.number().min(0).max(1),
  driveFromJob: z.number().min(0).max(1),
});

export type LineDistributionPct = z.infer<typeof lineDistributionPctSchema>;

/**
 * Minimum person-minutes billed for each handling phase whenever the job has
 * at least one plant unit. These stack on top of the plant-derived minutes,
 * which are split across phases using normalized `lineDistributionPct` weights
 * (load, unload, install, cleanUp only).
 */
export const handlingMinimumPersonMinutesSchema = z.object({
  load: z.number().min(0),
  unload: z.number().min(0),
  install: z.number().min(0),
  cleanUp: z.number().min(0),
});

export type HandlingMinimumPersonMinutes = z.infer<
  typeof handlingMinimumPersonMinutesSchema
>;

/** Simplified fallback: row in the "count → hours × people" table. */
export const simplifiedCountRowSchema = z.object({
  /** Upper bound (inclusive) on plant count for this row. null = everything else. */
  maxCount: z.number().int().nullable(),
  hoursPerPlant: z.number().min(0),
  /**
   * LEGACY — crew size is now derived from `targetClockMinutesPerPerson`.
   * Kept optional so old configs still parse.
   */
  people: z.number().int().min(1).optional(),
});

export type SimplifiedCountRow = z.infer<typeof simplifiedCountRowSchema>;

export const laborAutoConfigSchema = z.object({
  enabledByDefault: z.boolean(),
  /**
   * Hard rule: no person should work more than this many *clock* minutes for
   * the job. If the total man-minutes exceeds this, more people are added in
   * parallel (rounded up) so that clock-time per person stays at or below the
   * target. Default 60 min (≈ 1 hour per person).
   */
  targetClockMinutesPerPerson: z.number().min(1),
  /** Number of people during driveToJob / driveFromJob lines (driver count). */
  driverPeople: z.number().int().min(1),
  defaultDriveHoursOneWayFallback: z.number().min(0),
  /** Detailed per-inch complexity bands. */
  complexityBands: z.array(complexityBandSchema).min(1),
  /** Per-line adjustments (access, stairs, distance, fragile). */
  adjustments: laborAdjustmentsSchema,
  /**
   * Relative weights (0–1 each) for splitting **plant-derived** install
   * man-minutes across load / unload / install / cleanUp. Values are normalized
   * to sum to 1; drive keys are ignored here.
   */
  lineDistributionPct: lineDistributionPctSchema,
  /** Floor person-minutes per phase when the job includes plants. */
  handlingMinimumPersonMinutes: handlingMinimumPersonMinutesSchema,
  /** Simplified fallback table (plant-count based). */
  simplifiedByCount: z.array(simplifiedCountRowSchema).min(1),
  // ---- LEGACY (kept for backward compatibility, no longer used) ----
  crewThresholdInstallMinutes: z.number().min(0).optional(),
  defaultLoadHours: z.number().min(0).optional(),
  defaultUnloadHours: z.number().min(0).optional(),
  defaultCleanupHours: z.number().min(0).optional(),
  crewSmall: laborCrewMapSchema.optional(),
  crewLarge: laborCrewMapSchema.optional(),
});

export type LaborAutoConfig = z.infer<typeof laborAutoConfigSchema>;

/** Plant placement environment — drives material selection. */
export const plantEnvironmentSchema = z.enum(["indoor", "outdoor"]);
export type PlantEnvironment = z.infer<typeof plantEnvironmentSchema>;

/**
 * Staging recipe row: for a given complexity band + indoor/outdoor combination,
 * lists which materials (from `staggings-list.json`) and the qty per plant.
 *
 * Materials are referenced by their `sourceId` (the integer id in the staging
 * catalog JSON) so recipes survive renames of the display label.
 */
export const stagingRecipeComponentSchema = z.object({
  materialSourceId: z.number().int().min(1),
  /** Units of this material per plant (catalog packs/bags). */
  qtyPerPlant: z.number().min(0),
  /** Optional note shown in admin & line description. */
  note: z.string().optional(),
});

export const stagingRecipeSchema = z.object({
  id: z.string(),
  bandId: z.string(),
  environment: plantEnvironmentSchema,
  components: z.array(stagingRecipeComponentSchema),
});

export type StagingRecipeComponent = z.infer<typeof stagingRecipeComponentSchema>;
export type StagingRecipe = z.infer<typeof stagingRecipeSchema>;

/** Rotation row from the approval doc (fixed catalog prices). */
export const rotationCatalogEntrySchema = z.object({
  id: z.string(),
  group: z.string(),
  type: z.string(),
  variant: z.string(),
  sizeInches: z.number(),
  price: z.number(),
});

export const overheadBracketSchema = z.object({
  maxExclusive: z.number().nullable(),
  factor: z.number(),
});

export const subIrrigationRowSchema = z.object({
  sizeInches: z.number(),
  price: z.number(),
});

export const pricingEngineConfigSchema = z.object({
  schemaVersion: z.literal(1),
  plantFreightPct: z.number().min(0).max(1),
  potFreightPct: z.number().min(0).max(1),
  materialFreightPct: z.number().min(0).max(1),
  markupMin: z.number(),
  markupMax: z.number(),
  markupStep: z.number(),
  defaultMarkup: z.number(),
  hourlyRate: z.number(),
  weeksPerMonth: z.number(),
  plantWholesaleMonthlyFactor: z.number(),
  /** Minutes per plant for sizes in [largeMinInches, largeMaxInches]. */
  installMinutesLargeBand: z.number(),
  largeBandMinInches: z.number(),
  largeBandMaxInches: z.number(),
  /** Minutes per plant for sizes in [smallMinInches, smallMaxInches]. */
  installMinutesSmallBand: z.number(),
  smallBandMinInches: z.number(),
  smallBandMaxInches: z.number(),
  /** Fallback minutes per plant when size does not match bands. */
  installMinutesDefault: z.number(),
  overheadBrackets: z.array(overheadBracketSchema).length(4),
  rotationPlantsPerHour: z.number(),
  rotationTruckFeeOptions: z.tuple([z.literal(25), z.literal(50)]),
  defaultRotationTruckFee: z.union([z.literal(25), z.literal(50)]),
  rotationFrequencyWeeksOptions: z.tuple([
    z.literal(4),
    z.literal(6),
    z.literal(8),
  ]),
  defaultRotationFrequencyWeeks: z.union([
    z.literal(4),
    z.literal(6),
    z.literal(8),
  ]),
  rotationCatalog: z.array(rotationCatalogEntrySchema),
  defaultCommissionPct: z.number().min(0).max(1),
  subIrrigationTable: z.array(subIrrigationRowSchema),
  /** Legacy margin helper in computeSummary (fraction of annual maintenance). */
  maintenanceAnnualCostFraction: z.number().min(0).max(1),
  /** Greenery home/vendor address used as origin for drive-time estimates. */
  vendorHomeAddress: z.string(),
  /** Upper bound used when simulating per-client drive minutes (demo mode). */
  simulatedMaxDriveMinutes: z.number().min(0),
  /** Auto-labor calculation rules (crew sizes, thresholds, default durations). */
  laborAuto: laborAutoConfigSchema,
  /** Default placement when an item doesn't specify it. */
  defaultPlantEnvironment: plantEnvironmentSchema,
  /** Staging recipes (1 row per band × environment combination). */
  stagingRecipes: z.array(stagingRecipeSchema),
});

export type PricingEngineConfig = z.infer<typeof pricingEngineConfigSchema>;
export type RotationCatalogEntry = z.infer<typeof rotationCatalogEntrySchema>;

export const DEFAULT_PRICING_ENGINE_CONFIG: PricingEngineConfig = {
  schemaVersion: 1,
  plantFreightPct: 0.2,
  potFreightPct: 0.25,
  materialFreightPct: 0.25,
  markupMin: 1.5,
  markupMax: 3.0,
  markupStep: 0.5,
  defaultMarkup: 2.5,
  hourlyRate: 35,
  weeksPerMonth: 4.33,
  plantWholesaleMonthlyFactor: 0.65,
  installMinutesLargeBand: 2,
  largeBandMinInches: 10,
  largeBandMaxInches: 14,
  installMinutesSmallBand: 1,
  smallBandMinInches: 6,
  smallBandMaxInches: 8,
  installMinutesDefault: 1.5,
  overheadBrackets: [
    { maxExclusive: 500, factor: 0.8 },
    { maxExclusive: 1000, factor: 0.65 },
    { maxExclusive: 3000, factor: 0.5 },
    { maxExclusive: null, factor: 0.45 },
  ],
  rotationPlantsPerHour: 15,
  rotationTruckFeeOptions: [25, 50],
  defaultRotationTruckFee: 25,
  rotationFrequencyWeeksOptions: [4, 6, 8],
  defaultRotationFrequencyWeeks: 8,
  rotationCatalog: [
    { id: "rot-bro-4", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 4, price: 11.5 },
    { id: "rot-bro-6", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 6, price: 17.5 },
    { id: "rot-bro-8", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 8, price: 37.5 },
    { id: "rot-orch-ss-4", group: "Orchids", type: "Orchid", variant: "Single Spike", sizeInches: 4, price: 24 },
    { id: "rot-orch-ss-6", group: "Orchids", type: "Orchid", variant: "Single Spike", sizeInches: 6, price: 32 },
    { id: "rot-orch-ds-6", group: "Orchids", type: "Orchid", variant: "Double Spike", sizeInches: 6, price: 37 },
    { id: "rot-suc-an-4", group: "Succulents", type: "Succulent", variant: "Annual", sizeInches: 4, price: 6.5 },
    { id: "rot-suc-an-6", group: "Succulents", type: "Succulent", variant: "Annual", sizeInches: 6, price: 10 },
    { id: "rot-suc-an-9", group: "Succulents", type: "Succulent", variant: "Annual", sizeInches: 9, price: 14 },
    { id: "rot-suc-mum-6", group: "Succulents", type: "Succulent", variant: "Mum", sizeInches: 6, price: 17.5 },
  ],
  defaultCommissionPct: 0.1,
  subIrrigationTable: [
    { sizeInches: 17, price: 32 },
    { sizeInches: 14, price: 16.98 },
    { sizeInches: 10, price: 9.77 },
    { sizeInches: 8, price: 5.96 },
  ],
  maintenanceAnnualCostFraction: 0.4,
  vendorHomeAddress: "Orlando, FL, USA",
  simulatedMaxDriveMinutes: 60,
  laborAuto: {
    enabledByDefault: true,
    targetClockMinutesPerPerson: 120,
    driverPeople: 1,
    defaultDriveHoursOneWayFallback: 0.5,
    complexityBands: [
      { id: "small", label: "Small", minInches: null, maxInches: 8, baseMinutes: 7 },
      { id: "medium", label: "Medium", minInches: 9, maxInches: 14, baseMinutes: 18 },
      { id: "large", label: "Large", minInches: 15, maxInches: 20, baseMinutes: 37 },
      { id: "xl", label: "Extra large / heavy", minInches: 21, maxInches: null, baseMinutes: 75 },
    ],
    adjustments: {
      difficultAccessFactor: 1.5,
      stairsPerFloorFactor: 1.25,
      distanceBaselineMeters: 50,
      distanceStepMeters: 20,
      distanceExtraMinutes: 5,
      fragileFactor: 1.2,
    },
    lineDistributionPct: {
      load: 0.25,
      driveToJob: 0,
      unload: 0.25,
      install: 0.55,
      cleanUp: 0.15,
      driveFromJob: 0,
    },
    handlingMinimumPersonMinutes: {
      load: 12,
      unload: 12,
      install: 10,
      cleanUp: 10,
    },
    simplifiedByCount: [
      { maxCount: 5, hoursPerPlant: 0.3 },
      { maxCount: 10, hoursPerPlant: 0.4 },
      { maxCount: 20, hoursPerPlant: 0.35 },
      { maxCount: 40, hoursPerPlant: 0.3 },
      { maxCount: null, hoursPerPlant: 0.25 },
    ],
  },
  defaultPlantEnvironment: "indoor",
  // Reference for the default rule of thumb:
  // - Indoor double-pot decorative install: hard foam wedge under grow pot,
  //   soft foam (oasis) for gap fill, moss as visible top dressing.
  //   Larger pots use upgraded "green moss" for premium aesthetic.
  // - Outdoor planted-substrate install: real soil around the rootball, then
  //   bark / mulch as visible top dressing; large outdoor pots add lightweight
  //   filler ("peanut shell") at the bottom for drainage and weight reduction.
  // sourceId numbers come from `src/data/staggings-list.json`:
  //   1=Hard Foam, 2=Soft Foam, 3=Moss, 4=Green Moss,
  //   5=Soil, 6=Pine Bark, 7=Mulch, 8=Peanut Shell.
  stagingRecipes: [
    // -------- INDOOR (decorative, double-pot) --------
    {
      id: "small-indoor",
      bandId: "small",
      environment: "indoor",
      components: [
        { materialSourceId: 2, qtyPerPlant: 1, note: "Soft foam to level grow pot" },
        { materialSourceId: 3, qtyPerPlant: 1, note: "Top dressing with synthetic moss" },
      ],
    },
    {
      id: "medium-indoor",
      bandId: "medium",
      environment: "indoor",
      components: [
        { materialSourceId: 1, qtyPerPlant: 1, note: "Hard foam wedge under grow pot" },
        { materialSourceId: 2, qtyPerPlant: 1, note: "Soft foam to fill gaps" },
        { materialSourceId: 3, qtyPerPlant: 1, note: "Top dressing with synthetic moss" },
      ],
    },
    {
      id: "large-indoor",
      bandId: "large",
      environment: "indoor",
      components: [
        { materialSourceId: 1, qtyPerPlant: 2, note: "Double hard foam for support" },
        { materialSourceId: 2, qtyPerPlant: 1, note: "Soft foam for filler" },
        { materialSourceId: 4, qtyPerPlant: 1, note: "Green moss premium top" },
      ],
    },
    {
      id: "xl-indoor",
      bandId: "xl",
      environment: "indoor",
      components: [
        { materialSourceId: 1, qtyPerPlant: 3, note: "Triple hard foam (large pot)" },
        { materialSourceId: 2, qtyPerPlant: 2, note: "Soft foam doble" },
        { materialSourceId: 4, qtyPerPlant: 1, note: "Green moss premium top" },
      ],
    },
    // -------- OUTDOOR (planted, real substrate) --------
    {
      id: "small-outdoor",
      bandId: "small",
      environment: "outdoor",
      components: [
        { materialSourceId: 5, qtyPerPlant: 1, note: "Soil (1 bag)" },
        { materialSourceId: 7, qtyPerPlant: 1, note: "Mulch como top dressing" },
      ],
    },
    {
      id: "medium-outdoor",
      bandId: "medium",
      environment: "outdoor",
      components: [
        { materialSourceId: 5, qtyPerPlant: 1, note: "Soil for rooting" },
        { materialSourceId: 6, qtyPerPlant: 1, note: "Pine bark top dressing" },
      ],
    },
    {
      id: "large-outdoor",
      bandId: "large",
      environment: "outdoor",
      components: [
        { materialSourceId: 5, qtyPerPlant: 2, note: "Soil (higher volume)" },
        { materialSourceId: 6, qtyPerPlant: 1, note: "Pine bark top dressing" },
        { materialSourceId: 8, qtyPerPlant: 1, note: "Peanut shell drainage" },
      ],
    },
    {
      id: "xl-outdoor",
      bandId: "xl",
      environment: "outdoor",
      components: [
        { materialSourceId: 5, qtyPerPlant: 3, note: "Soil (XL pot)" },
        { materialSourceId: 6, qtyPerPlant: 2, note: "Doble pine bark" },
        { materialSourceId: 8, qtyPerPlant: 1, note: "Peanut shell drainage" },
      ],
    },
  ],
};

export function parsePricingEngineConfig(raw: unknown): PricingEngineConfig {
  const parsed = pricingEngineConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid pricing engine config: ${msg}`);
  }
  return parsed.data;
}

export function mergeWithPricingDefaults(
  partial: unknown,
): PricingEngineConfig {
  if (!partial || typeof partial !== "object") {
    return DEFAULT_PRICING_ENGINE_CONFIG;
  }
  const merged = {
    ...DEFAULT_PRICING_ENGINE_CONFIG,
    ...partial,
    overheadBrackets:
      Array.isArray((partial as { overheadBrackets?: unknown }).overheadBrackets) &&
      (partial as { overheadBrackets: unknown[] }).overheadBrackets.length === 4
        ? (partial as { overheadBrackets: PricingEngineConfig["overheadBrackets"] })
            .overheadBrackets
        : DEFAULT_PRICING_ENGINE_CONFIG.overheadBrackets,
    rotationCatalog: Array.isArray(
      (partial as { rotationCatalog?: unknown }).rotationCatalog,
    )
      ? (partial as { rotationCatalog: RotationCatalogEntry[] }).rotationCatalog
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationCatalog,
    subIrrigationTable: Array.isArray(
      (partial as { subIrrigationTable?: unknown }).subIrrigationTable,
    )
      ? (partial as { subIrrigationTable: PricingEngineConfig["subIrrigationTable"] })
          .subIrrigationTable
      : DEFAULT_PRICING_ENGINE_CONFIG.subIrrigationTable,
    laborAuto: mergeLaborAuto(
      (partial as { laborAuto?: unknown }).laborAuto,
    ),
    defaultPlantEnvironment:
      (partial as { defaultPlantEnvironment?: unknown }).defaultPlantEnvironment ===
        "indoor" ||
      (partial as { defaultPlantEnvironment?: unknown }).defaultPlantEnvironment ===
        "outdoor"
        ? ((partial as { defaultPlantEnvironment: PlantEnvironment }).defaultPlantEnvironment)
        : DEFAULT_PRICING_ENGINE_CONFIG.defaultPlantEnvironment,
    stagingRecipes: Array.isArray(
      (partial as { stagingRecipes?: unknown }).stagingRecipes,
    )
      ? (partial as { stagingRecipes: StagingRecipe[] }).stagingRecipes
      : DEFAULT_PRICING_ENGINE_CONFIG.stagingRecipes,
  };
  return parsePricingEngineConfig(merged);
}

function mergeLaborAuto(partial: unknown): LaborAutoConfig {
  const base = DEFAULT_PRICING_ENGINE_CONFIG.laborAuto;
  if (!partial || typeof partial !== "object") return base;
  const p = partial as Partial<LaborAutoConfig>;
  return {
    enabledByDefault:
      typeof p.enabledByDefault === "boolean"
        ? p.enabledByDefault
        : base.enabledByDefault,
    targetClockMinutesPerPerson:
      typeof p.targetClockMinutesPerPerson === "number" &&
      p.targetClockMinutesPerPerson >= 1
        ? p.targetClockMinutesPerPerson
        : base.targetClockMinutesPerPerson,
    driverPeople:
      typeof p.driverPeople === "number" && p.driverPeople >= 1
        ? Math.floor(p.driverPeople)
        : base.driverPeople,
    defaultDriveHoursOneWayFallback:
      typeof p.defaultDriveHoursOneWayFallback === "number"
        ? p.defaultDriveHoursOneWayFallback
        : base.defaultDriveHoursOneWayFallback,
    complexityBands:
      Array.isArray(p.complexityBands) && p.complexityBands.length > 0
        ? (p.complexityBands as ComplexityBand[])
        : base.complexityBands,
    adjustments: { ...base.adjustments, ...(p.adjustments ?? {}) },
    lineDistributionPct: {
      ...base.lineDistributionPct,
      ...(p.lineDistributionPct ?? {}),
    },
    handlingMinimumPersonMinutes: (() => {
      const b = base.handlingMinimumPersonMinutes;
      const raw = p.handlingMinimumPersonMinutes;
      if (!raw || typeof raw !== "object") return b;
      const o = raw as Record<string, unknown>;
      const one = (v: unknown, def: number) =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : def;
      return {
        load: one(o.load, b.load),
        unload: one(o.unload, b.unload),
        install: one(o.install, b.install),
        cleanUp: one(o.cleanUp, b.cleanUp),
      };
    })(),
    simplifiedByCount:
      Array.isArray(p.simplifiedByCount) && p.simplifiedByCount.length > 0
        ? (p.simplifiedByCount as SimplifiedCountRow[])
        : base.simplifiedByCount,
    // Legacy fields preserved verbatim (no longer consumed by engine).
    crewThresholdInstallMinutes: p.crewThresholdInstallMinutes,
    defaultLoadHours: p.defaultLoadHours,
    defaultUnloadHours: p.defaultUnloadHours,
    defaultCleanupHours: p.defaultCleanupHours,
    crewSmall: p.crewSmall,
    crewLarge: p.crewLarge,
  };
}

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

export const cppByDiameterPointSchema = z.object({
  diameterInches: z.number().min(0),
  cpp: z.number().positive(),
  minEmployees: z.number().int().min(1).default(1),
  /** Optional explicit threshold where staffing switches from 1 to 2 people. */
  twoPeopleThresholdQty: z.number().positive().optional(),
});

export type CppByDiameterPoint = z.infer<typeof cppByDiameterPointSchema>;

export const cppInterpolationModeSchema = z.enum(["linear"]);
export type CppInterpolationMode = z.infer<typeof cppInterpolationModeSchema>;

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
  /** Used by staging recipe selection (not by CPP staffing math). */
  complexityBands: z.array(complexityBandSchema).min(1),
  /** LEGACY for staffing math; retained for backward compatibility. */
  adjustments: laborAdjustmentsSchema,
  /**
   * Relative weights (0–1 each) for splitting **plant-derived** install
   * man-minutes across load / unload / install / cleanUp. Values are normalized
   * to sum to 1; drive keys are ignored here.
   */
  lineDistributionPct: lineDistributionPctSchema,
  /** Floor person-minutes per phase when the job includes plants. */
  handlingMinimumPersonMinutes: handlingMinimumPersonMinutesSchema,
  /** LEGACY fallback table (kept only for backward compatibility). */
  simplifiedByCount: z.array(simplifiedCountRowSchema).min(1).optional(),
  /**
   * Core staffing model: how many plants one person can handle for each
   * reference diameter.
   */
  cppByDiameterPoints: z.array(cppByDiameterPointSchema).min(2),
  /** For intermediate diameters not listed in points. */
  cppInterpolationMode: cppInterpolationModeSchema,
  /** Fallback CPP when diameter cannot be resolved from item data. */
  missingDiameterFallbackCpp: z.number().positive(),
  /** Minimum employees when diameter cannot be resolved from item data. */
  missingDiameterFallbackMinEmployees: z.number().int().min(1),
  /** Optional explicit fallback threshold for switching from 1 to 2 people. */
  missingDiameterTwoPeopleThresholdQty: z.number().positive().optional(),
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

export const truckFeeRangeSchema = z.object({
  from: z.number().int().min(1),
  to: z.number().int().min(1).nullable(),
  fee: z.number().positive(),
});

export type TruckFeeRange = z.infer<typeof truckFeeRangeSchema>;

export const pricingEngineConfigSchema = z.object({
  schemaVersion: z.literal(2),
  plantFreightPct: z.number().min(0).max(1),
  potFreightPct: z.number().min(0).max(1),
  materialFreightPct: z.number().min(0).max(1),
  /** Additional charge per plant when planting is done without pot sourcing. */
  plantingWithoutPotFeePerPlant: z.number().min(0),
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
  /** Rotation labor P2: plants/hour for Bromeliads, Color rotation, Succulents (GUTS §8). */
  rotationPlantsPerHour: z.number(),
  /** Rotation labor P2: plants/hour for Orchids only (GUTS §8). */
  rotationOrchidPlantsPerHour: z.number(),
  /** Hourly rate used in rotation P2 labor (GUTS: $35/h default). */
  rotationLaborHourlyRate: z.number(),
  /** Freight on rotation catalog retail for P3 (GUTS: 25%). */
  rotationFreightPct: z.number().min(0).max(1),
  /**
   * Configurable nested ranges for logistics/truck fee by total plant count.
   * Must be contiguous and non-overlapping; first starts at 1 and last ends at infinity (to=null).
   */
  rotationTruckFeeRanges: z.array(truckFeeRangeSchema).min(1),
  // Legacy fields kept to avoid breaking old persisted config files.
  rotationTruckFeeOptions: z.array(z.number().positive()).min(1).optional(),
  defaultRotationTruckFee: z.number().positive().optional(),
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
}).superRefine((cfg, ctx) => {
  const ranges = cfg.rotationTruckFeeRanges;
  if (!ranges.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rotationTruckFeeRanges"],
      message: "At least one truck fee range is required",
    });
    return;
  }
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  if (sorted[0]!.from !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rotationTruckFeeRanges", 0, "from"],
      message: "First range must start at 1",
    });
  }
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    if (cur.to != null && cur.to < cur.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rotationTruckFeeRanges", i, "to"],
        message: "Range 'to' must be >= 'from'",
      });
    }
    if (i < sorted.length - 1) {
      const next = sorted[i + 1]!;
      if (cur.to == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rotationTruckFeeRanges", i, "to"],
          message: "Only last range can be infinite",
        });
      } else if (next.from !== cur.to + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rotationTruckFeeRanges", i + 1, "from"],
          message: "Ranges must be contiguous without gaps/overlap",
        });
      }
    } else if (cur.to !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rotationTruckFeeRanges", i, "to"],
        message: "Last range must be infinite (to=null)",
      });
    }
  }
});

export type PricingEngineConfig = z.infer<typeof pricingEngineConfigSchema>;
export type RotationCatalogEntry = z.infer<typeof rotationCatalogEntrySchema>;

export const DEFAULT_PRICING_ENGINE_CONFIG: PricingEngineConfig = {
  schemaVersion: 2,
  plantFreightPct: 0.25,
  potFreightPct: 0.25,
  materialFreightPct: 0.25,
  plantingWithoutPotFeePerPlant: 12,
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
  rotationOrchidPlantsPerHour: 20,
  rotationLaborHourlyRate: 35,
  rotationFreightPct: 0.25,
  rotationTruckFeeRanges: [
    { from: 1, to: 20, fee: 25 },
    { from: 21, to: null, fee: 50 },
  ],
  rotationTruckFeeOptions: [25, 50],
  defaultRotationTruckFee: 25,
  rotationFrequencyWeeksOptions: [4, 6, 8],
  defaultRotationFrequencyWeeks: 8,
  rotationCatalog: [
    { id: "rot-bro-4", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 4, price: 11.5 },
    { id: "rot-bro-6", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 6, price: 17.5 },
    { id: "rot-bro-8", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 8, price: 37.5 },
    { id: "rot-bro-14", group: "Bromeliads", type: "Bromeliad", variant: "—", sizeInches: 14, price: 200 },
    { id: "rot-orch-ss-4", group: "Orchids", type: "Orchid", variant: "Single Spike", sizeInches: 4, price: 24 },
    { id: "rot-orch-ss-6", group: "Orchids", type: "Orchid", variant: "Single Spike", sizeInches: 6, price: 32 },
    { id: "rot-orch-ds-6", group: "Orchids", type: "Orchid", variant: "Double Spike", sizeInches: 6, price: 38.75 },
    { id: "rot-suc-2", group: "Succulents", type: "Succulent", variant: "—", sizeInches: 2, price: 4 },
    { id: "rot-suc-3", group: "Succulents", type: "Succulent", variant: "—", sizeInches: 3, price: 5 },
    { id: "rot-suc-4", group: "Succulents", type: "Succulent", variant: "—", sizeInches: 4, price: 8.5 },
    { id: "rot-suc-6", group: "Succulents", type: "Succulent", variant: "—", sizeInches: 6, price: 24 },
    { id: "rot-suc-an-9", group: "Succulents", type: "Succulent", variant: "Annual", sizeInches: 9, price: 14 },
    { id: "rot-suc-mum-6", group: "Succulents", type: "Succulent", variant: "Mum", sizeInches: 6, price: 17.5 },
    {
      id: "rot-clr-ann-4",
      group: "Color rotation",
      type: "Color rotation",
      variant: "Annual",
      sizeInches: 4,
      price: 2.5,
    },
    {
      id: "rot-clr-ann-6",
      group: "Color rotation",
      type: "Color rotation",
      variant: "Annual",
      sizeInches: 6,
      price: 13.75,
    },
    {
      id: "rot-clr-ann-8",
      group: "Color rotation",
      type: "Color rotation",
      variant: "Annual",
      sizeInches: 8,
      price: 18.75,
    },
    {
      id: "rot-clr-mum-6",
      group: "Color rotation",
      type: "Color rotation",
      variant: "Mum",
      sizeInches: 6,
      price: 18.75,
    },
  ],
  defaultCommissionPct: 0.05,
  subIrrigationTable: [
    { sizeInches: 17, price: 48 },
    { sizeInches: 14, price: 26 },
    { sizeInches: 10, price: 16 },
    { sizeInches: 8, price: 9 },
  ],
  maintenanceAnnualCostFraction: 0.4,
  vendorHomeAddress: "1751 Directors Row, Orlando, FL 32809, Estados Unidos",
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
    cppByDiameterPoints: [
      { diameterInches: 8, cpp: 50, minEmployees: 1, twoPeopleThresholdQty: 50 },
      { diameterInches: 10, cpp: 30, minEmployees: 1, twoPeopleThresholdQty: 30 },
      { diameterInches: 14, cpp: 20, minEmployees: 1, twoPeopleThresholdQty: 20 },
      { diameterInches: 17, cpp: 10, minEmployees: 1, twoPeopleThresholdQty: 10 },
      { diameterInches: 19, cpp: 1.5, minEmployees: 1, twoPeopleThresholdQty: 1.5 },
    ],
    cppInterpolationMode: "linear",
    missingDiameterFallbackCpp: 1.5,
    missingDiameterFallbackMinEmployees: 1,
    missingDiameterTwoPeopleThresholdQty: 1.5,
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

/** Keys from schema v1; ignored when merging persisted JSON/Mongo. */
const LEGACY_PRICING_ENGINE_KEYS = [
  "guaranteeAnnualAddOnPct",
  "replacementReservePct",
] as const;

function stripLegacyPricingEngineKeys(
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const o = { ...partial };
  for (const k of LEGACY_PRICING_ENGINE_KEYS) delete o[k];
  return o;
}

export function mergeWithPricingDefaults(
  partial: unknown,
): PricingEngineConfig {
  if (!partial || typeof partial !== "object") {
    return DEFAULT_PRICING_ENGINE_CONFIG;
  }
  const ext = stripLegacyPricingEngineKeys(partial as Record<string, unknown>);
  const plantingFeeRaw = ext.plantingWithoutPotFeePerPlant;
  const plantingWithoutPotFeePerPlant =
    typeof plantingFeeRaw === "number" &&
    Number.isFinite(plantingFeeRaw) &&
    plantingFeeRaw >= 0
      ? plantingFeeRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.plantingWithoutPotFeePerPlant;
  const rotationTruckFeeOptionsRaw = ext.rotationTruckFeeOptions;
  const rotationTruckFeeOptions =
    Array.isArray(rotationTruckFeeOptionsRaw) &&
    rotationTruckFeeOptionsRaw.length > 0 &&
    rotationTruckFeeOptionsRaw.every(
      (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
    )
      ? [...rotationTruckFeeOptionsRaw]
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationTruckFeeOptions;
  const defaultRotationTruckFeeRaw = ext.defaultRotationTruckFee;
  const defaultRotationTruckFee =
    typeof defaultRotationTruckFeeRaw === "number" &&
    Number.isFinite(defaultRotationTruckFeeRaw) &&
    defaultRotationTruckFeeRaw > 0
      ? defaultRotationTruckFeeRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.defaultRotationTruckFee;
  const rotationFrequencyWeeksOptionsRaw = ext.rotationFrequencyWeeksOptions;
  const rotationFrequencyWeeksOptions =
    Array.isArray(rotationFrequencyWeeksOptionsRaw) &&
    rotationFrequencyWeeksOptionsRaw.length === 3 &&
    rotationFrequencyWeeksOptionsRaw[0] === 4 &&
    rotationFrequencyWeeksOptionsRaw[1] === 6 &&
    rotationFrequencyWeeksOptionsRaw[2] === 8
      ? ([4, 6, 8] as const)
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationFrequencyWeeksOptions;
  const defaultRotationFrequencyWeeksRaw = ext.defaultRotationFrequencyWeeks;
  const defaultRotationFrequencyWeeks =
    defaultRotationFrequencyWeeksRaw === 4 ||
    defaultRotationFrequencyWeeksRaw === 6 ||
    defaultRotationFrequencyWeeksRaw === 8
      ? defaultRotationFrequencyWeeksRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.defaultRotationFrequencyWeeks;
  const defaultCommissionPctRaw = ext.defaultCommissionPct;
  const defaultCommissionPct =
    typeof defaultCommissionPctRaw === "number" &&
    Number.isFinite(defaultCommissionPctRaw) &&
    defaultCommissionPctRaw >= 0 &&
    defaultCommissionPctRaw <= 1
      ? defaultCommissionPctRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.defaultCommissionPct;
  const maintenanceAnnualCostFractionRaw = ext.maintenanceAnnualCostFraction;
  const maintenanceAnnualCostFraction =
    typeof maintenanceAnnualCostFractionRaw === "number" &&
    Number.isFinite(maintenanceAnnualCostFractionRaw) &&
    maintenanceAnnualCostFractionRaw >= 0 &&
    maintenanceAnnualCostFractionRaw <= 1
      ? maintenanceAnnualCostFractionRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.maintenanceAnnualCostFraction;
  const vendorHomeAddressRaw = ext.vendorHomeAddress;
  const vendorHomeAddress =
    typeof vendorHomeAddressRaw === "string" && vendorHomeAddressRaw.trim()
      ? vendorHomeAddressRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.vendorHomeAddress;
  const simulatedMaxDriveMinutesRaw = ext.simulatedMaxDriveMinutes;
  const simulatedMaxDriveMinutes =
    typeof simulatedMaxDriveMinutesRaw === "number" &&
    Number.isFinite(simulatedMaxDriveMinutesRaw) &&
    simulatedMaxDriveMinutesRaw >= 0
      ? simulatedMaxDriveMinutesRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.simulatedMaxDriveMinutes;
  const rotationPlantsPerHourRaw = ext.rotationPlantsPerHour;
  const rotationPlantsPerHour =
    typeof rotationPlantsPerHourRaw === "number" &&
    Number.isFinite(rotationPlantsPerHourRaw) &&
    rotationPlantsPerHourRaw > 0
      ? rotationPlantsPerHourRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationPlantsPerHour;
  const rotationOrchidPlantsPerHourRaw = ext.rotationOrchidPlantsPerHour;
  const rotationOrchidPlantsPerHour =
    typeof rotationOrchidPlantsPerHourRaw === "number" &&
    Number.isFinite(rotationOrchidPlantsPerHourRaw) &&
    rotationOrchidPlantsPerHourRaw > 0
      ? rotationOrchidPlantsPerHourRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationOrchidPlantsPerHour;
  const rotationLaborHourlyRateRaw = ext.rotationLaborHourlyRate;
  const rotationLaborHourlyRate =
    typeof rotationLaborHourlyRateRaw === "number" &&
    Number.isFinite(rotationLaborHourlyRateRaw) &&
    rotationLaborHourlyRateRaw >= 0
      ? rotationLaborHourlyRateRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationLaborHourlyRate;
  const rotationFreightPctRaw = ext.rotationFreightPct;
  const rotationFreightPct =
    typeof rotationFreightPctRaw === "number" &&
    Number.isFinite(rotationFreightPctRaw) &&
    rotationFreightPctRaw >= 0 &&
    rotationFreightPctRaw <= 1
      ? rotationFreightPctRaw
      : DEFAULT_PRICING_ENGINE_CONFIG.rotationFreightPct;
  const merged = {
    ...DEFAULT_PRICING_ENGINE_CONFIG,
    ...ext,
    schemaVersion: DEFAULT_PRICING_ENGINE_CONFIG.schemaVersion,
    plantingWithoutPotFeePerPlant,
    rotationTruckFeeOptions,
    defaultRotationTruckFee,
    rotationFrequencyWeeksOptions,
    defaultRotationFrequencyWeeks,
    defaultCommissionPct,
    maintenanceAnnualCostFraction,
    vendorHomeAddress,
    simulatedMaxDriveMinutes,
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
    rotationTruckFeeRanges: normalizeTruckFeeRanges(
      (partial as { rotationTruckFeeRanges?: unknown }).rotationTruckFeeRanges,
      DEFAULT_PRICING_ENGINE_CONFIG.rotationTruckFeeRanges,
    ),
    rotationPlantsPerHour,
    rotationOrchidPlantsPerHour,
    rotationLaborHourlyRate,
    rotationFreightPct,
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
  const optionalNonNegativeNumber = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
  const optionalCrewMap = (v: unknown): LaborCrewMap | undefined => {
    const parsed = laborCrewMapSchema.safeParse(v);
    return parsed.success ? parsed.data : undefined;
  };
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
    cppByDiameterPoints: normalizeCppPoints(
      p.cppByDiameterPoints,
      base.cppByDiameterPoints,
    ),
    cppInterpolationMode:
      p.cppInterpolationMode === "linear"
        ? p.cppInterpolationMode
        : base.cppInterpolationMode,
    missingDiameterFallbackCpp:
      typeof p.missingDiameterFallbackCpp === "number" &&
      Number.isFinite(p.missingDiameterFallbackCpp) &&
      p.missingDiameterFallbackCpp > 0
        ? p.missingDiameterFallbackCpp
        : base.missingDiameterFallbackCpp,
    missingDiameterFallbackMinEmployees:
      typeof p.missingDiameterFallbackMinEmployees === "number" &&
      Number.isFinite(p.missingDiameterFallbackMinEmployees) &&
      p.missingDiameterFallbackMinEmployees >= 1
        ? Math.floor(p.missingDiameterFallbackMinEmployees)
        : base.missingDiameterFallbackMinEmployees,
    missingDiameterTwoPeopleThresholdQty:
      typeof p.missingDiameterTwoPeopleThresholdQty === "number" &&
      Number.isFinite(p.missingDiameterTwoPeopleThresholdQty) &&
      p.missingDiameterTwoPeopleThresholdQty > 0
        ? p.missingDiameterTwoPeopleThresholdQty
        : base.missingDiameterTwoPeopleThresholdQty,
    // Legacy fields preserved only when valid; null legacy values should not
    // override defaults or break schema validation for persisted Mongo docs.
    crewThresholdInstallMinutes: optionalNonNegativeNumber(
      p.crewThresholdInstallMinutes,
    ),
    defaultLoadHours: optionalNonNegativeNumber(p.defaultLoadHours),
    defaultUnloadHours: optionalNonNegativeNumber(p.defaultUnloadHours),
    defaultCleanupHours: optionalNonNegativeNumber(p.defaultCleanupHours),
    crewSmall: optionalCrewMap(p.crewSmall),
    crewLarge: optionalCrewMap(p.crewLarge),
  };
}

function normalizeCppPoints(
  candidate: unknown,
  fallback: CppByDiameterPoint[],
): CppByDiameterPoint[] {
  if (!Array.isArray(candidate)) return fallback;
  const cleaned = candidate
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as { diameterInches?: unknown; cpp?: unknown };
      const minRaw = row as { minEmployees?: unknown; twoPeopleThresholdQty?: unknown };
      const diameterInches = Number(r.diameterInches);
      const cpp = Number(r.cpp);
      const minEmployees = Number(minRaw.minEmployees);
      const twoPeopleThresholdQty = Number(minRaw.twoPeopleThresholdQty);
      if (!Number.isFinite(diameterInches) || !Number.isFinite(cpp)) return null;
      if (diameterInches < 0 || cpp <= 0) return null;
      const point: CppByDiameterPoint = {
        diameterInches,
        cpp,
        minEmployees:
          Number.isFinite(minEmployees) && minEmployees >= 1
            ? Math.floor(minEmployees)
            : 1,
      };
      if (Number.isFinite(twoPeopleThresholdQty) && twoPeopleThresholdQty > 0) {
        point.twoPeopleThresholdQty = twoPeopleThresholdQty;
      }
      return point;
    })
    .filter((row): row is CppByDiameterPoint => row != null)
    .sort((a, b) => a.diameterInches - b.diameterInches);
  if (cleaned.length < 2) return fallback;
  return cleaned;
}

function normalizeTruckFeeRanges(
  candidate: unknown,
  fallback: TruckFeeRange[],
): TruckFeeRange[] {
  if (!Array.isArray(candidate)) return fallback;
  const cleaned = candidate
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as { from?: unknown; to?: unknown; fee?: unknown };
      const from = Number(r.from);
      const fee = Number(r.fee);
      const toRaw = r.to;
      const to =
        toRaw === null || toRaw === undefined || toRaw === ""
          ? null
          : Number(toRaw);
      if (!Number.isFinite(from) || !Number.isFinite(fee)) return null;
      if (from < 1 || fee <= 0) return null;
      if (to !== null && (!Number.isFinite(to) || to < from)) return null;
      return {
        from: Math.floor(from),
        to: to === null ? null : Math.floor(to),
        fee,
      };
    })
    .filter((row): row is TruckFeeRange => row != null)
    .sort((a, b) => a.from - b.from);
  if (!cleaned.length) return fallback;
  // Let schema superRefine validate contiguity and infinity constraints.
  return cleaned;
}

import type {
  CppByDiameterPoint,
  CppInterpolationMode,
} from "./engine-schema";

export interface CppResolution {
  cpp: number;
  minEmployees: number;
  twoPeopleThresholdQty: number;
  usedFallbackDiameter: boolean;
  bandId: string;
  bandLabel: string;
}

export function parseSizeInchesFromText(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*["'′″]/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function sortedCppPoints(points: CppByDiameterPoint[]): CppByDiameterPoint[] {
  return [...points].sort((a, b) => a.diameterInches - b.diameterInches);
}

function linearInterpolateCpp(
  diameter: number,
  left: CppByDiameterPoint,
  right: CppByDiameterPoint,
): number {
  if (right.diameterInches === left.diameterInches) return left.cpp;
  const t =
    (diameter - left.diameterInches) / (right.diameterInches - left.diameterInches);
  return left.cpp + (right.cpp - left.cpp) * t;
}

function linearInterpolateMinEmployees(
  diameter: number,
  left: CppByDiameterPoint,
  right: CppByDiameterPoint,
): number {
  if (right.diameterInches === left.diameterInches) return left.minEmployees;
  const t =
    (diameter - left.diameterInches) / (right.diameterInches - left.diameterInches);
  return left.minEmployees + (right.minEmployees - left.minEmployees) * t;
}

function pointTwoPeopleThreshold(point: CppByDiameterPoint): number {
  const explicit = Number(point.twoPeopleThresholdQty);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(0.0001, point.cpp);
}

function linearInterpolateThreshold(
  diameter: number,
  left: CppByDiameterPoint,
  right: CppByDiameterPoint,
): number {
  if (right.diameterInches === left.diameterInches) {
    return pointTwoPeopleThreshold(left);
  }
  const t =
    (diameter - left.diameterInches) / (right.diameterInches - left.diameterInches);
  const leftThreshold = pointTwoPeopleThreshold(left);
  const rightThreshold = pointTwoPeopleThreshold(right);
  return leftThreshold + (rightThreshold - leftThreshold) * t;
}

export function resolveCppForDiameter(
  diameterInches: number | null,
  options: {
    cppByDiameterPoints: CppByDiameterPoint[];
    cppInterpolationMode: CppInterpolationMode;
    missingDiameterFallbackCpp: number;
    missingDiameterFallbackMinEmployees: number;
    missingDiameterTwoPeopleThresholdQty?: number;
  },
): CppResolution {
  const points = sortedCppPoints(options.cppByDiameterPoints);
  const fallback = Math.max(0.0001, options.missingDiameterFallbackCpp);
  const fallbackThreshold = Math.max(
    0.0001,
    typeof options.missingDiameterTwoPeopleThresholdQty === "number" &&
      Number.isFinite(options.missingDiameterTwoPeopleThresholdQty) &&
      options.missingDiameterTwoPeopleThresholdQty > 0
      ? options.missingDiameterTwoPeopleThresholdQty
      : fallback,
  );
  if (points.length < 2) {
    return {
      cpp: fallback,
      minEmployees: Math.max(1, Math.floor(options.missingDiameterFallbackMinEmployees)),
      twoPeopleThresholdQty: fallbackThreshold,
      usedFallbackDiameter: true,
      bandId: "missing-diameter",
      bandLabel: "Missing diameter (fallback)",
    };
  }
  if (diameterInches == null || !Number.isFinite(diameterInches)) {
    return {
      cpp: fallback,
      minEmployees: Math.max(1, Math.floor(options.missingDiameterFallbackMinEmployees)),
      twoPeopleThresholdQty: fallbackThreshold,
      usedFallbackDiameter: true,
      bandId: "missing-diameter",
      bandLabel: "Missing diameter (fallback)",
    };
  }

  const d = Math.max(0, diameterInches);
  if (d <= points[0]!.diameterInches) {
    return {
      cpp: points[0]!.cpp,
      minEmployees: Math.max(1, Math.ceil(points[0]!.minEmployees)),
      twoPeopleThresholdQty: Math.max(
        0.0001,
        pointTwoPeopleThreshold(points[0]!),
      ),
      usedFallbackDiameter: false,
      bandId: `d<=${points[0]!.diameterInches}`,
      bandLabel: `<=${points[0]!.diameterInches}"`,
    };
  }
  const last = points[points.length - 1]!;
  if (d >= last.diameterInches) {
    return {
      cpp: last.cpp,
      minEmployees: Math.max(1, Math.ceil(last.minEmployees)),
      twoPeopleThresholdQty: Math.max(0.0001, pointTwoPeopleThreshold(last)),
      usedFallbackDiameter: false,
      bandId: `d>=${last.diameterInches}`,
      bandLabel: `>=${last.diameterInches}"`,
    };
  }

  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i]!;
    const right = points[i + 1]!;
    if (d >= left.diameterInches && d <= right.diameterInches) {
      if (d === right.diameterInches) {
        return {
          cpp: right.cpp,
          minEmployees: Math.max(1, Math.ceil(right.minEmployees)),
          twoPeopleThresholdQty: Math.max(0.0001, pointTwoPeopleThreshold(right)),
          usedFallbackDiameter: false,
          bandId: `d=${right.diameterInches}`,
          bandLabel: `${right.diameterInches}"`,
        };
      }
      if (d === left.diameterInches) {
        return {
          cpp: left.cpp,
          minEmployees: Math.max(1, Math.ceil(left.minEmployees)),
          twoPeopleThresholdQty: Math.max(0.0001, pointTwoPeopleThreshold(left)),
          usedFallbackDiameter: false,
          bandId: `d=${left.diameterInches}`,
          bandLabel: `${left.diameterInches}"`,
        };
      }
      const cpp =
        options.cppInterpolationMode === "linear"
          ? linearInterpolateCpp(d, left, right)
          : linearInterpolateCpp(d, left, right);
      const minEmployees =
        options.cppInterpolationMode === "linear"
          ? linearInterpolateMinEmployees(d, left, right)
          : linearInterpolateMinEmployees(d, left, right);
      const twoPeopleThresholdQty =
        options.cppInterpolationMode === "linear"
          ? linearInterpolateThreshold(d, left, right)
          : linearInterpolateThreshold(d, left, right);
      return {
        cpp: Math.max(0.0001, cpp),
        minEmployees: Math.max(1, Math.ceil(minEmployees)),
        twoPeopleThresholdQty: Math.max(0.0001, twoPeopleThresholdQty),
        usedFallbackDiameter: false,
        bandId: `${left.diameterInches}-${right.diameterInches}`,
        bandLabel: `${left.diameterInches}"-${right.diameterInches}"`,
      };
    }
  }

  return {
    cpp: fallback,
    minEmployees: Math.max(1, Math.floor(options.missingDiameterFallbackMinEmployees)),
    twoPeopleThresholdQty: fallbackThreshold,
    usedFallbackDiameter: true,
    bandId: "missing-diameter",
    bandLabel: "Missing diameter (fallback)",
  };
}

export function cppForDiameter(
  diameterInches: number | null,
  options: {
    cppByDiameterPoints: CppByDiameterPoint[];
    cppInterpolationMode: CppInterpolationMode;
    missingDiameterFallbackCpp: number;
    missingDiameterFallbackMinEmployees: number;
    missingDiameterTwoPeopleThresholdQty?: number;
  },
): number {
  return resolveCppForDiameter(diameterInches, options).cpp;
}

export function peopleNeededForQtyAndDiameter(
  qty: number,
  diameterInches: number | null,
  options: {
    cppByDiameterPoints: CppByDiameterPoint[];
    cppInterpolationMode: CppInterpolationMode;
    missingDiameterFallbackCpp: number;
    missingDiameterFallbackMinEmployees: number;
    missingDiameterTwoPeopleThresholdQty?: number;
  },
): number {
  const units = Math.max(0, Number(qty) || 0);
  if (units <= 0) return 1;
  const resolved = resolveCppForDiameter(diameterInches, options);
  const threshold = Math.max(0.0001, resolved.twoPeopleThresholdQty);
  return units > threshold ? 2 : 1;
}

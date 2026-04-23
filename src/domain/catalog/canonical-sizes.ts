import { z } from "zod";

/** Canonical pot / plant tray diameters (inches) — single source for catalog seeds and labor PWU. */
export const CANONICAL_POT_SIZES_INCHES = [
  2, 3, 4, 6, 8, 12, 14, 17, 21, 24,
] as const;

export type CanonicalPotSizeInches = (typeof CANONICAL_POT_SIZES_INCHES)[number];

export const canonicalPotSizeInchesSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(12),
  z.literal(14),
  z.literal(17),
  z.literal(21),
  z.literal(24),
]);

export function isCanonicalPotSizeInches(
  n: number,
): n is CanonicalPotSizeInches {
  return (CANONICAL_POT_SIZES_INCHES as readonly number[]).includes(n);
}

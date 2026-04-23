import { z } from "zod";

const envSchema = z.object({
  /** Optional so `next build` can run without a DB; runtime routes that use Mongo must still set this. */
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB_NAME: z.string().min(1).default("greenery_proposals"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = envSchema.parse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  });
  return cached;
}

/** For tests that override process.env between cases. */
export function resetServerEnvCache(): void {
  cached = null;
}

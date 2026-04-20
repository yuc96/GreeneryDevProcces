import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  DEFAULT_PRICING_ENGINE_CONFIG,
  mergeWithPricingDefaults,
  type PricingEngineConfig,
} from "./engine-schema";

const CONFIG_REL = join("data", "pricing-engine.config.json");

function configPath(): string {
  return join(process.cwd(), CONFIG_REL);
}

let cache: PricingEngineConfig | null = null;

export async function readPricingConfigFromDisk(): Promise<PricingEngineConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    // Merge on read so files saved before new fields (e.g. laborAuto bands,
    // vendorHomeAddress) keep working after a schema extension.
    return mergeWithPricingDefaults(JSON.parse(raw));
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") {
      return DEFAULT_PRICING_ENGINE_CONFIG;
    }
    throw e;
  }
}

export function getCachedPricingConfig(): PricingEngineConfig {
  return cache ?? DEFAULT_PRICING_ENGINE_CONFIG;
}

export function setCachedPricingConfig(c: PricingEngineConfig): void {
  cache = c;
}

/** Sync load for server paths that cannot await (first call primes cache). */
export function primePricingConfigSync(config: PricingEngineConfig): void {
  cache = config;
}

export async function loadPricingConfig(): Promise<PricingEngineConfig> {
  const c = await readPricingConfigFromDisk();
  cache = c;
  return c;
}

export async function savePricingConfig(
  partial: unknown,
): Promise<PricingEngineConfig> {
  // `mergeWithPricingDefaults` validates via parsePricingEngineConfig at the end.
  const merged = mergeWithPricingDefaults(partial);
  const dir = dirname(configPath());
  await mkdir(dir, { recursive: true });
  const tmp = `${configPath()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await rename(tmp, configPath());
  cache = merged;
  return merged;
}

export function resetPricingConfigCache(): void {
  cache = null;
}

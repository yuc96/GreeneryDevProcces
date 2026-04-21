import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  DEFAULT_LABOR_ENGINE_CONFIG,
  mergeWithLaborDefaults,
  type LaborEngineConfig,
} from "./labor-engine-schema";

const CONFIG_REL = join("data", "labor-engine.config.json");

function configPath(): string {
  const override = process.env.LABOR_ENGINE_CONFIG_PATH;
  if (override && override.length > 0) return override;
  return join(process.cwd(), CONFIG_REL);
}

let cache: LaborEngineConfig | null = null;

export async function readLaborEngineConfigFromDisk(): Promise<LaborEngineConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    return mergeWithLaborDefaults(JSON.parse(raw));
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : "";
    if (code === "ENOENT") {
      return DEFAULT_LABOR_ENGINE_CONFIG;
    }
    throw e;
  }
}

export function getCachedLaborEngineConfig(): LaborEngineConfig {
  return cache ?? DEFAULT_LABOR_ENGINE_CONFIG;
}

export function setCachedLaborEngineConfig(c: LaborEngineConfig): void {
  cache = c;
}

export function primeLaborEngineConfigSync(config: LaborEngineConfig): void {
  cache = config;
}

export async function loadLaborEngineConfig(): Promise<LaborEngineConfig> {
  const c = await readLaborEngineConfigFromDisk();
  cache = c;
  return c;
}

export async function saveLaborEngineConfig(
  partial: unknown,
): Promise<LaborEngineConfig> {
  const merged = mergeWithLaborDefaults(partial);
  const path = configPath();
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await rename(tmp, path);
  cache = merged;
  return merged;
}

export function resetLaborEngineConfigCache(): void {
  cache = null;
}

import type { LaborEngineConfig } from "../pricing/labor-engine-schema";
import { enforceMinHours } from "../pricing/labor-engine/hours";

export type DirectionsResult =
  | { ok: true; durationSeconds: number }
  | { ok: false; error: string };

export interface GoogleMapsDirectionsPort {
  getDurationInTrafficSeconds(
    originAddress: string,
    destinationAddress: string,
  ): Promise<DirectionsResult>;
}

interface CacheEntry {
  expiresAtMs: number;
  result: DirectionsResult;
}

function cacheKey(a: string, b: string): string {
  return `${a.trim().toLowerCase()}|${b.trim().toLowerCase()}`;
}

export class CachedGoogleMapsDirections implements GoogleMapsDirectionsPort {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inner: GoogleMapsDirectionsPort;
  private readonly ttlMs: number;

  constructor(inner: GoogleMapsDirectionsPort, ttlHours: number) {
    this.inner = inner;
    this.ttlMs = Math.max(1, ttlHours) * 3600 * 1000;
  }

  async getDurationInTrafficSeconds(
    originAddress: string,
    destinationAddress: string,
  ): Promise<DirectionsResult> {
    const key = cacheKey(originAddress, destinationAddress);
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAtMs > now) {
      return hit.result;
    }
    const result = await this.inner.getDurationInTrafficSeconds(
      originAddress,
      destinationAddress,
    );
    if (result.ok) {
      this.cache.set(key, { expiresAtMs: now + this.ttlMs, result });
    }
    return result;
  }
}

export class FetchGoogleMapsDirections implements GoogleMapsDirectionsPort {
  constructor(private readonly apiKey: string) {}

  async getDurationInTrafficSeconds(
    originAddress: string,
    destinationAddress: string,
  ): Promise<DirectionsResult> {
    if (!this.apiKey) {
      return { ok: false, error: "Missing API key" };
    }
    const params = new URLSearchParams({
      origin: originAddress,
      destination: destinationAddress,
      mode: "driving",
      departure_time: "now",
      traffic_model: "best_guess",
      key: this.apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        status: string;
        error_message?: string;
        routes?: Array<{
          legs?: Array<{
            duration_in_traffic?: { value: number };
            duration?: { value: number };
          }>;
        }>;
      };
      if (data.status !== "OK" || !data.routes?.length) {
        return {
          ok: false,
          error: data.error_message ?? data.status ?? "NO_ROUTES",
        };
      }
      const leg = data.routes[0]?.legs?.[0];
      const sec =
        leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? null;
      if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) {
        return { ok: false, error: "No duration in leg" };
      }
      return { ok: true, durationSeconds: sec };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }
}

export function secondsToDriveHours(
  seconds: number,
  laborCfg: LaborEngineConfig,
): number {
  const h = seconds / 3600;
  return enforceMinHours(h, laborCfg.MIN_HOURS);
}

export function fallbackDriveHours(laborCfg: LaborEngineConfig): number {
  return enforceMinHours(laborCfg.DRIVE_TIME_FALLBACK_HOURS, laborCfg.MIN_HOURS);
}

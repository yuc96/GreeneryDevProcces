import { NextResponse } from "next/server";
import {
  CachedGoogleMapsDirections,
  FetchGoogleMapsDirections,
  fallbackDriveHours,
  secondsToDriveHours,
} from "@/server/maps/google-maps-directions";
import { loadLaborEngineConfig } from "@/server/pricing/labor-config-store";
import { handleRouteError } from "@/server/route-utils";

let cachedPort: CachedGoogleMapsDirections | null = null;
let cachedTtlHours = -1;
let cachedKeyFingerprint = "";

function directionsPort(
  apiKey: string,
  ttlHours: number,
): CachedGoogleMapsDirections {
  const fp = `${apiKey.length}:${ttlHours}`;
  if (!cachedPort || cachedTtlHours !== ttlHours || cachedKeyFingerprint !== fp) {
    cachedPort = new CachedGoogleMapsDirections(
      new FetchGoogleMapsDirections(apiKey),
      ttlHours,
    );
    cachedTtlHours = ttlHours;
    cachedKeyFingerprint = fp;
  }
  return cachedPort;
}

export async function POST(req: Request) {
  try {
    const laborCfg = await loadLaborEngineConfig();
    const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
    const port = directionsPort(apiKey, laborCfg.MAPS_CACHE_TTL_HOURS);

    const body = (await req.json()) as {
      originAddress?: string;
      destinationAddress?: string;
    };
    const origin =
      typeof body.originAddress === "string" ? body.originAddress.trim() : "";
    const dest =
      typeof body.destinationAddress === "string"
        ? body.destinationAddress.trim()
        : "";
    if (!origin || !dest) {
      return NextResponse.json(
        { message: "originAddress and destinationAddress are required" },
        { status: 400 },
      );
    }

    const outTo = await port.getDurationInTrafficSeconds(origin, dest);
    const outFrom = await port.getDurationInTrafficSeconds(dest, origin);
    const fallbackUsed = !outTo.ok || !outFrom.ok;

    const toJobHours = fallbackUsed
      ? fallbackDriveHours(laborCfg)
      : secondsToDriveHours(outTo.durationSeconds, laborCfg);
    const fromJobHours = fallbackUsed
      ? fallbackDriveHours(laborCfg)
      : secondsToDriveHours(outFrom.durationSeconds, laborCfg);

    return NextResponse.json({
      toJobHours,
      fromJobHours,
      fallbackUsed,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

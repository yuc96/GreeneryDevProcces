export interface LatLng {
  lat: number;
  lng: number;
}

export const GREENERY_HQ_ADDRESS =
  "1751 Directors Row, Orlando, FL 32809, Estados Unidos";

// Approximate coordinate for Greenery HQ reference point.
export const GREENERY_HQ_COORD: LatLng = {
  lat: 28.4827,
  lng: -81.3657,
};

export const GREENERY_SERVICE_RADIUS_KM = 80;
export const DRIVE_SPEED_KMH = 45;

const ZIP_COORDS: Record<string, LatLng> = {
  "32703": { lat: 28.6648, lng: -81.4856 },
  "32714": { lat: 28.6556, lng: -81.4143 },
  "32789": { lat: 28.5977, lng: -81.3525 },
  "32792": { lat: 28.6072, lng: -81.2867 },
  "32801": { lat: 28.5411, lng: -81.379 },
  "32803": { lat: 28.5554, lng: -81.3513 },
  "32804": { lat: 28.579, lng: -81.3981 },
  "32806": { lat: 28.5066, lng: -81.3724 },
  "32807": { lat: 28.5473, lng: -81.3003 },
  "32808": { lat: 28.5916, lng: -81.4478 },
  "32809": { lat: 28.4637, lng: -81.3815 },
  "32810": { lat: 28.6235, lng: -81.4304 },
  "32811": { lat: 28.5067, lng: -81.4507 },
  "32812": { lat: 28.5106, lng: -81.3293 },
  "32819": { lat: 28.4513, lng: -81.4868 },
  "32822": { lat: 28.4917, lng: -81.2898 },
  "32824": { lat: 28.3647, lng: -81.3574 },
  "32827": { lat: 28.4296, lng: -81.2627 },
  "32829": { lat: 28.487, lng: -81.2673 },
  "32835": { lat: 28.5232, lng: -81.4743 },
  "32839": { lat: 28.4937, lng: -81.4051 },
  "34741": { lat: 28.3004, lng: -81.4072 },
  "34743": { lat: 28.3183, lng: -81.3571 },
};

const ADDRESS_OVERRIDES: Array<{ contains: string; coord: LatLng }> = [
  {
    contains: "1751 directors row, orlando, fl 32809",
    coord: GREENERY_HQ_COORD,
  },
  {
    contains: "directors row, orlando, fl 32809",
    coord: GREENERY_HQ_COORD,
  },
];

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return r * c;
}

function toRad(n: number): number {
  return (n * Math.PI) / 180;
}

function extractZip(address: string): string | null {
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? null;
}

export function resolveAddressToCoord(address: string): LatLng | null {
  const normalized = normalizeAddress(address);
  for (const entry of ADDRESS_OVERRIDES) {
    if (normalized.includes(entry.contains)) return entry.coord;
  }
  const zip = extractZip(normalized);
  if (!zip) return null;
  return ZIP_COORDS[zip] ?? null;
}

export function minutesFromDistanceKm(
  km: number,
  speedKmh = DRIVE_SPEED_KMH,
): number {
  if (!(km > 0)) return 0;
  return Math.round((km / speedKmh) * 60);
}

export function isWithinServiceRadius(
  km: number,
  maxRadiusKm = GREENERY_SERVICE_RADIUS_KM,
): boolean {
  return km <= maxRadiusKm;
}

export function estimateDriveFromAddress(
  address: string,
  opts?: {
    origin?: LatLng;
    maxRadiusKm?: number;
    speedKmh?: number;
  },
): { distanceKm: number; driveMinutes: number } {
  const coord = resolveAddressToCoord(address);
  if (!coord) {
    throw new Error(
      "Could not resolve address coordinates. Include a supported Central Florida ZIP code.",
    );
  }
  const origin = opts?.origin ?? GREENERY_HQ_COORD;
  const maxRadiusKm = opts?.maxRadiusKm ?? GREENERY_SERVICE_RADIUS_KM;
  const distance = distanceKm(origin, coord);
  if (!isWithinServiceRadius(distance, maxRadiusKm)) {
    throw new Error(
      `Address is outside service radius (${maxRadiusKm}km from Greenery HQ).`,
    );
  }
  return {
    distanceKm: Math.round(distance * 100) / 100,
    driveMinutes: minutesFromDistanceKm(distance, opts?.speedKmh ?? DRIVE_SPEED_KMH),
  };
}

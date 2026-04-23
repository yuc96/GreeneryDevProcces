import type { ClientEntity, LocationEntity } from "@/server/domain";
import { HttpError } from "@/server/http-error";
import {
  estimateDriveFromAddress,
  GREENERY_SERVICE_RADIUS_KM,
} from "@/server/geo/distance";

/** Stable IDs so dev seeds match prior in-memory fixtures. */
export const SEED_MARRIOTT = "00000000-0000-4000-8000-000000000001";
export const SEED_GOOGLE = "00000000-0000-4000-8000-000000000002";
export const SEED_MARRIOTT_LOC_A = "00000000-0000-4000-8000-000000000011";
export const SEED_MARRIOTT_LOC_B = "00000000-0000-4000-8000-000000000012";
export const SEED_GOOGLE_LOC_A = "00000000-0000-4000-8000-000000000021";
export const SEED_LAKE_EOLA_BISTRO = "00000000-0000-4000-8000-000000000003";
export const SEED_SUNRISE_MEDICAL = "00000000-0000-4000-8000-000000000004";
export const SEED_LAKE_EOLA_LOC = "00000000-0000-4000-8000-000000000031";
export const SEED_SUNRISE_LOC = "00000000-0000-4000-8000-000000000041";

export function enforceAddressWithinServiceRadius(address?: string): {
  address: string;
  driveTimeMinutes: number;
  driveDistanceKm: number;
} {
  const trimmed = address?.trim();
  if (!trimmed) {
    throw new HttpError(400, "location address is required");
  }
  try {
    const estimated = estimateDriveFromAddress(trimmed);
    return {
      address: trimmed,
      driveTimeMinutes: estimated.driveMinutes,
      driveDistanceKm: estimated.distanceKm,
    };
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : `Address must be within ${GREENERY_SERVICE_RADIUS_KM}km radius`;
    throw new HttpError(400, msg);
  }
}

function deriveClientDriveFromLocations(locations: LocationEntity[]): {
  driveTimeMinutes?: number;
  driveDistanceKm?: number;
} {
  if (!locations.length) return {};
  const best = locations.reduce((bestSoFar, loc) => {
    if (bestSoFar == null) return loc;
    const a = loc.driveDistanceKm ?? Number.POSITIVE_INFINITY;
    const b = bestSoFar.driveDistanceKm ?? Number.POSITIVE_INFINITY;
    return a < b ? loc : bestSoFar;
  }, null as LocationEntity | null);
  return {
    driveTimeMinutes: best?.driveTimeMinutes,
    driveDistanceKm: best?.driveDistanceKm,
  };
}

/** Demo clients for local / staging DB (`npm run db:seed`). */
export function buildInitialClientEntities(): ClientEntity[] {
  const marriottId = SEED_MARRIOTT;
  const googleId = SEED_GOOGLE;
  const l1 = SEED_MARRIOTT_LOC_A;
  const l2 = SEED_MARRIOTT_LOC_B;
  const l3 = SEED_GOOGLE_LOC_A;
  const marriottLocA = enforceAddressWithinServiceRadius(
    "400 W Livingston St, Orlando, FL 32801",
  );
  const marriottLocB = enforceAddressWithinServiceRadius(
    "9939 Universal Blvd, Orlando, FL 32819",
  );
  const googleLocA = enforceAddressWithinServiceRadius(
    "601 Mid Florida Dr, Orlando, FL 32824",
  );
  const marriottLocations: LocationEntity[] = [
    {
      id: l1,
      clientId: marriottId,
      name: "Main Lobby",
      address: marriottLocA.address,
      driveTimeMinutes: marriottLocA.driveTimeMinutes,
      driveDistanceKm: marriottLocA.driveDistanceKm,
    },
    {
      id: l2,
      clientId: marriottId,
      name: "Convention Area",
      address: marriottLocB.address,
      driveTimeMinutes: marriottLocB.driveTimeMinutes,
      driveDistanceKm: marriottLocB.driveDistanceKm,
    },
  ];
  const googleLocations: LocationEntity[] = [
    {
      id: l3,
      clientId: googleId,
      name: "Edificio B - Oficinas",
      address: googleLocA.address,
      driveTimeMinutes: googleLocA.driveTimeMinutes,
      driveDistanceKm: googleLocA.driveDistanceKm,
    },
  ];
  const marriottDrive = deriveClientDriveFromLocations(marriottLocations);
  const googleDrive = deriveClientDriveFromLocations(googleLocations);

  const lakeEolaId = SEED_LAKE_EOLA_BISTRO;
  const sunriseId = SEED_SUNRISE_MEDICAL;
  const lakeEolaLocResolved = enforceAddressWithinServiceRadius(
    "1 N Orange Ave, Orlando, FL 32801",
  );
  const sunriseLocResolved = enforceAddressWithinServiceRadius(
    "2501 N Orange Ave, Orlando, FL 32804",
  );
  const lakeEolaLocations: LocationEntity[] = [
    {
      id: SEED_LAKE_EOLA_LOC,
      clientId: lakeEolaId,
      name: "Street-level patio",
      address: lakeEolaLocResolved.address,
      driveTimeMinutes: lakeEolaLocResolved.driveTimeMinutes,
      driveDistanceKm: lakeEolaLocResolved.driveDistanceKm,
    },
  ];
  const sunriseLocations: LocationEntity[] = [
    {
      id: SEED_SUNRISE_LOC,
      clientId: sunriseId,
      name: "Main clinic",
      address: sunriseLocResolved.address,
      driveTimeMinutes: sunriseLocResolved.driveTimeMinutes,
      driveDistanceKm: sunriseLocResolved.driveDistanceKm,
    },
  ];
  const lakeEolaDrive = deriveClientDriveFromLocations(lakeEolaLocations);
  const sunriseDrive = deriveClientDriveFromLocations(sunriseLocations);

  const now = new Date().toISOString();
  return [
    {
      id: marriottId,
      companyName: "Marriott Downtown",
      contactName: "Jordan Blake",
      email: "j.blake@marriottdowntown.com",
      phone: "407-555-0111",
      companyPhone: "407-555-0100",
      companyContact: "Hotel operator — main switchboard",
      isExistingCustomer: true,
      driveTimeMinutes: marriottDrive.driveTimeMinutes,
      driveDistanceKm: marriottDrive.driveDistanceKm,
      locations: marriottLocations,
      createdAt: now,
    },
    {
      id: googleId,
      companyName: "Google Campus",
      contactName: "Alex Rivera",
      email: "a.rivera@google.com",
      phone: "408-555-0198",
      companyPhone: "650-555-0140",
      companyContact: "Campus reception & facilities desk",
      isExistingCustomer: true,
      driveTimeMinutes: googleDrive.driveTimeMinutes,
      driveDistanceKm: googleDrive.driveDistanceKm,
      locations: googleLocations,
      createdAt: now,
    },
    {
      id: lakeEolaId,
      companyName: "Lake Eola Bistro",
      contactName: "Morgan Chen",
      email: "m.chen@lakeeolabistro.example",
      phone: "407-555-0221",
      companyPhone: "407-555-0200",
      companyContact: "Restaurant office / management",
      isExistingCustomer: false,
      driveTimeMinutes: lakeEolaDrive.driveTimeMinutes,
      driveDistanceKm: lakeEolaDrive.driveDistanceKm,
      locations: lakeEolaLocations,
      createdAt: now,
    },
    {
      id: sunriseId,
      companyName: "Sunrise Retail Plaza",
      contactName: "Taylor Brooks",
      email: "t.brooks@sunriseretail.example",
      phone: "407-555-0331",
      companyPhone: "407-555-0300",
      companyContact: "Plaza property management office",
      isExistingCustomer: false,
      driveTimeMinutes: sunriseDrive.driveTimeMinutes,
      driveDistanceKm: sunriseDrive.driveDistanceKm,
      locations: sunriseLocations,
      createdAt: now,
    },
  ];
}

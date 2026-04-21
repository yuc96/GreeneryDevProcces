import { randomUUID } from "crypto";
import type { ClientEntity, LocationEntity } from "./domain";
import { HttpError } from "./http-error";
import {
  estimateDriveFromAddress,
  GREENERY_SERVICE_RADIUS_KM,
} from "./geo/distance";

export interface CreateClientInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  billingAddress?: string;
  driveTimeMinutes?: number;
  locations?: Array<{ name: string; address?: string; driveTimeMinutes?: number }>;
}

/** Stable IDs so dev / HMR restarts do not invalidate clientId in an open browser tab. */
const SEED_MARRIOTT = "00000000-0000-4000-8000-000000000001";
const SEED_GOOGLE = "00000000-0000-4000-8000-000000000002";
const SEED_MARRIOTT_LOC_A = "00000000-0000-4000-8000-000000000011";
const SEED_MARRIOTT_LOC_B = "00000000-0000-4000-8000-000000000012";
const SEED_GOOGLE_LOC_A = "00000000-0000-4000-8000-000000000021";
const SEED_LAKE_EOLA_BISTRO = "00000000-0000-4000-8000-000000000003";
const SEED_SUNRISE_MEDICAL = "00000000-0000-4000-8000-000000000004";
const SEED_LAKE_EOLA_LOC = "00000000-0000-4000-8000-000000000031";
const SEED_SUNRISE_LOC = "00000000-0000-4000-8000-000000000041";

function enforceAddressWithinServiceRadius(address?: string): {
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

function seed(): Map<string, ClientEntity> {
  const clients = new Map<string, ClientEntity>();
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

  clients.set(marriottId, {
    id: marriottId,
    companyName: "Marriott Downtown",
    contactName: "GM",
    email: "gm@marriottdowntown.com",
    phone: "407-555-0100",
    isExistingCustomer: true,
    driveTimeMinutes: marriottDrive.driveTimeMinutes,
    driveDistanceKm: marriottDrive.driveDistanceKm,
    locations: marriottLocations,
    createdAt: new Date().toISOString(),
  });
  clients.set(googleId, {
    id: googleId,
    companyName: "Google Campus",
    contactName: "Facilities",
    email: "facilities@google.com",
    isExistingCustomer: true,
    driveTimeMinutes: googleDrive.driveTimeMinutes,
    driveDistanceKm: googleDrive.driveDistanceKm,
    locations: googleLocations,
    createdAt: new Date().toISOString(),
  });
  clients.set(lakeEolaId, {
    id: lakeEolaId,
    companyName: "Lake Eola Bistro",
    contactName: "Owner",
    email: "hello@lakeeolabistro.example",
    phone: "407-555-0200",
    isExistingCustomer: false,
    driveTimeMinutes: lakeEolaDrive.driveTimeMinutes,
    driveDistanceKm: lakeEolaDrive.driveDistanceKm,
    locations: lakeEolaLocations,
    createdAt: new Date().toISOString(),
  });
  clients.set(sunriseId, {
    id: sunriseId,
    companyName: "Sunrise Retail Plaza",
    contactName: "Property manager",
    email: "pm@sunriseretail.example",
    phone: "407-555-0300",
    isExistingCustomer: false,
    driveTimeMinutes: sunriseDrive.driveTimeMinutes,
    driveDistanceKm: sunriseDrive.driveDistanceKm,
    locations: sunriseLocations,
    createdAt: new Date().toISOString(),
  });
  return clients;
}

export class ClientsStore {
  private clients = seed();

  findAll(): ClientEntity[] {
    return [...this.clients.values()];
  }

  findOne(id: string): ClientEntity {
    const c = this.clients.get(id);
    if (!c) throw new HttpError(404, `Client ${id} not found`);
    return c;
  }

  create(dto: CreateClientInput): ClientEntity {
    if (!dto.companyName?.trim())
      throw new HttpError(400, "companyName is required");
    if (!dto.contactName?.trim())
      throw new HttpError(400, "contactName is required");
    if (!dto.email?.trim()) throw new HttpError(400, "email is required");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email);
    if (!emailOk) throw new HttpError(400, "email is invalid");

    const id = randomUUID();
    const locations: LocationEntity[] = (dto.locations ?? []).map((loc, idx) => {
      const name = loc.name?.trim() ?? "";
      if (!name) {
        throw new HttpError(400, `locations[${idx}].name is required`);
      }
      const resolved = enforceAddressWithinServiceRadius(loc.address);
      return {
        id: randomUUID(),
        clientId: id,
        name,
        address: resolved.address,
        driveTimeMinutes: resolved.driveTimeMinutes,
        driveDistanceKm: resolved.driveDistanceKm,
      };
    });
    if (!locations.length && !dto.billingAddress?.trim()) {
      throw new HttpError(400, "billingAddress is required when no locations are provided");
    }
    const billingResolved = dto.billingAddress?.trim()
      ? enforceAddressWithinServiceRadius(dto.billingAddress)
      : null;
    const clientDrive = locations.length
      ? deriveClientDriveFromLocations(locations)
      : {
          driveTimeMinutes: billingResolved?.driveTimeMinutes,
          driveDistanceKm: billingResolved?.driveDistanceKm,
        };
    const entity: ClientEntity = {
      id,
      companyName: dto.companyName.trim(),
      contactName: dto.contactName.trim(),
      email: dto.email.trim(),
      phone: dto.phone?.trim(),
      billingAddress: billingResolved?.address ?? dto.billingAddress?.trim(),
      isExistingCustomer: false,
      driveTimeMinutes: clientDrive.driveTimeMinutes,
      driveDistanceKm: clientDrive.driveDistanceKm,
      locations,
      createdAt: new Date().toISOString(),
    };
    this.clients.set(id, entity);
    return entity;
  }

  locationsFor(clientId: string): LocationEntity[] {
    return this.findOne(clientId).locations;
  }
}

const globalForStores = globalThis as unknown as {
  __m01_clientsStore?: ClientsStore;
};

export function getClientsStore(): ClientsStore {
  if (!globalForStores.__m01_clientsStore) {
    globalForStores.__m01_clientsStore = new ClientsStore();
  }
  return globalForStores.__m01_clientsStore;
}

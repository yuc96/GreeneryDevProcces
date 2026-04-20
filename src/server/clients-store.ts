import { randomUUID } from "crypto";
import type { ClientEntity, LocationEntity } from "./domain";
import { HttpError } from "./http-error";

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

function seed(): Map<string, ClientEntity> {
  const clients = new Map<string, ClientEntity>();
  const marriottId = SEED_MARRIOTT;
  const googleId = SEED_GOOGLE;
  const l1 = SEED_MARRIOTT_LOC_A;
  const l2 = SEED_MARRIOTT_LOC_B;
  const l3 = SEED_GOOGLE_LOC_A;
  clients.set(marriottId, {
    id: marriottId,
    companyName: "Marriott Downtown",
    contactName: "GM",
    email: "gm@marriottdowntown.com",
    phone: "407-555-0100",
    isExistingCustomer: true,
    driveTimeMinutes: 20,
    locations: [
      {
        id: l1,
        clientId: marriottId,
        name: "Main Lobby",
        address: "Orlando, FL",
      },
      {
        id: l2,
        clientId: marriottId,
        name: "Pool Area",
        address: "Orlando, FL",
      },
    ],
    createdAt: new Date().toISOString(),
  });
  clients.set(googleId, {
    id: googleId,
    companyName: "Google Campus",
    contactName: "Facilities",
    email: "facilities@google.com",
    isExistingCustomer: true,
    driveTimeMinutes: 45,
    locations: [
      {
        id: l3,
        clientId: googleId,
        name: "Edificio B - Oficinas",
        address: "Mountain View, CA",
      },
    ],
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
    const locations: LocationEntity[] = (dto.locations ?? []).map(
      (loc, idx) => {
        const name = loc.name?.trim() ?? "";
        if (!name) {
          throw new HttpError(400, `locations[${idx}].name is required`);
        }
        return {
          id: randomUUID(),
          clientId: id,
          name,
          address: loc.address?.trim(),
          driveTimeMinutes:
            typeof loc.driveTimeMinutes === "number" &&
            Number.isFinite(loc.driveTimeMinutes) &&
            loc.driveTimeMinutes >= 0
              ? loc.driveTimeMinutes
              : undefined,
        };
      },
    );
    const entity: ClientEntity = {
      id,
      companyName: dto.companyName.trim(),
      contactName: dto.contactName.trim(),
      email: dto.email.trim(),
      phone: dto.phone?.trim(),
      billingAddress: dto.billingAddress?.trim(),
      isExistingCustomer: false,
      driveTimeMinutes:
        typeof dto.driveTimeMinutes === "number" &&
        Number.isFinite(dto.driveTimeMinutes) &&
        dto.driveTimeMinutes >= 0
          ? dto.driveTimeMinutes
          : undefined,
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

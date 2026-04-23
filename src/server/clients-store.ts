import { randomUUID } from "crypto";
import type { ClientEntity, LocationEntity } from "./domain";
import { HttpError } from "./http-error";
import { COL } from "@/infrastructure/mongo/collections";
import { getMongoDb } from "@/infrastructure/mongo/mongo-client";
import {
  asDocCollection,
  filterById,
} from "@/infrastructure/mongo/mongo-string-id";
import { enforceAddressWithinServiceRadius } from "@/infrastructure/seed/clients-seed";

/** Try strict HQ-radius geocode; if ZIP/table misses, still save the address for the job site. */
function resolveLocationAddressForSave(trimmedAddress: string): {
  address: string;
  driveTimeMinutes: number;
  driveDistanceKm: number;
} {
  try {
    return enforceAddressWithinServiceRadius(trimmedAddress);
  } catch {
    return {
      address: trimmedAddress,
      driveTimeMinutes: 45,
      driveDistanceKm: 40,
    };
  }
}

export interface CreateClientInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  /** Main company / office line (required for new accounts). */
  companyPhone: string;
  /** Reception / office / department for company inquiries (required for new accounts). */
  companyContact: string;
  billingAddress?: string;
  driveTimeMinutes?: number;
  locations?: Array<{
    name: string;
    address?: string;
    driveTimeMinutes?: number;
  }>;
}

export interface UpdateClientInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  companyPhone: string;
  companyContact: string;
  isExistingCustomer?: boolean;
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

function clientDocToEntity(doc: Record<string, unknown>): ClientEntity {
  const id = String(doc._id ?? doc.id);
  const rest = { ...doc } as Record<string, unknown>;
  delete rest._id;
  delete rest.id;
  return { ...rest, id } as ClientEntity;
}

function clientEntityToDoc(c: ClientEntity): Record<string, unknown> {
  const { id, ...rest } = c;
  return { _id: id, ...rest };
}

export async function listClients(): Promise<ClientEntity[]> {
  const db = await getMongoDb();
  const col = asDocCollection(db, COL.clients);
  const docs = await col.find({}).sort({ companyName: 1 }).toArray();
  return docs.map((d) => clientDocToEntity(d));
}

export async function findClient(id: string): Promise<ClientEntity> {
  const db = await getMongoDb();
  const col = asDocCollection(db, COL.clients);
  const doc = await col.findOne(filterById(id));
  if (!doc) throw new HttpError(404, `Client ${id} not found`);
  return clientDocToEntity(doc);
}

export async function createClient(dto: CreateClientInput): Promise<ClientEntity> {
  if (!dto.companyName?.trim())
    throw new HttpError(400, "companyName is required");
  if (!dto.contactName?.trim())
    throw new HttpError(400, "contactName is required");
  if (!dto.email?.trim()) throw new HttpError(400, "email is required");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email);
  if (!emailOk) throw new HttpError(400, "email is invalid");
  if (!dto.companyPhone?.trim())
    throw new HttpError(400, "companyPhone is required");
  if (!dto.companyContact?.trim())
    throw new HttpError(400, "companyContact is required");

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
    throw new HttpError(
      400,
      "billingAddress is required when no locations are provided",
    );
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
    companyPhone: dto.companyPhone?.trim(),
    companyContact: dto.companyContact?.trim(),
    billingAddress: billingResolved?.address ?? dto.billingAddress?.trim(),
    isExistingCustomer: false,
    driveTimeMinutes: clientDrive.driveTimeMinutes,
    driveDistanceKm: clientDrive.driveDistanceKm,
    locations,
    createdAt: new Date().toISOString(),
  };
  const db = await getMongoDb();
  await asDocCollection(db, COL.clients).insertOne(clientEntityToDoc(entity));
  return entity;
}

export async function updateClient(
  id: string,
  dto: UpdateClientInput,
): Promise<ClientEntity> {
  const prev = await findClient(id);
  if (!dto.companyName?.trim())
    throw new HttpError(400, "companyName is required");
  if (!dto.contactName?.trim())
    throw new HttpError(400, "contactName is required");
  if (!dto.email?.trim()) throw new HttpError(400, "email is required");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email);
  if (!emailOk) throw new HttpError(400, "email is invalid");
  if (!dto.companyPhone?.trim())
    throw new HttpError(400, "companyPhone is required");
  if (!dto.companyContact?.trim())
    throw new HttpError(400, "companyContact is required");

  const phone = dto.phone?.trim();
  const updated: ClientEntity = {
    ...prev,
    companyName: dto.companyName.trim(),
    contactName: dto.contactName.trim(),
    email: dto.email.trim(),
    phone: phone || undefined,
    companyPhone: dto.companyPhone.trim(),
    companyContact: dto.companyContact.trim(),
    isExistingCustomer:
      dto.isExistingCustomer !== undefined
        ? Boolean(dto.isExistingCustomer)
        : prev.isExistingCustomer,
  };

  const db = await getMongoDb();
  const col = asDocCollection(db, COL.clients);
  const { id: _id, ...rest } = updated;
  await col.updateOne(filterById(id), {
    $set: { ...rest },
  });
  return updated;
}

export async function locationsForClient(
  clientId: string,
): Promise<LocationEntity[]> {
  const c = await findClient(clientId);
  return c.locations;
}

export interface ClientLocationUpsertInput {
  name: string;
  address: string;
}

export async function addClientLocation(
  clientId: string,
  dto: ClientLocationUpsertInput,
): Promise<{ client: ClientEntity; location: LocationEntity }> {
  const name = dto.name?.trim() ?? "";
  if (!name) throw new HttpError(400, "location name is required");
  const addrRaw = dto.address?.trim() ?? "";
  if (!addrRaw) throw new HttpError(400, "location address is required");
  const resolved = resolveLocationAddressForSave(addrRaw);
  const prev = await findClient(clientId);
  const newLoc: LocationEntity = {
    id: randomUUID(),
    clientId,
    name,
    address: resolved.address,
    driveTimeMinutes: resolved.driveTimeMinutes,
    driveDistanceKm: resolved.driveDistanceKm,
  };
  const locations = [...prev.locations, newLoc];
  const clientDrive = deriveClientDriveFromLocations(locations);
  const updated: ClientEntity = {
    ...prev,
    locations,
    driveTimeMinutes: clientDrive.driveTimeMinutes,
    driveDistanceKm: clientDrive.driveDistanceKm,
  };
  const db = await getMongoDb();
  const col = asDocCollection(db, COL.clients);
  const { id: _id, ...rest } = updated;
  await col.updateOne(filterById(clientId), { $set: { ...rest } });
  return { client: updated, location: newLoc };
}

export async function updateClientLocation(
  clientId: string,
  locationId: string,
  dto: { name?: string; address?: string },
): Promise<{ client: ClientEntity; location: LocationEntity }> {
  const prev = await findClient(clientId);
  const idx = prev.locations.findIndex((l) => l.id === locationId);
  if (idx < 0) throw new HttpError(404, "location not found");
  const cur = prev.locations[idx]!;
  const name = dto.name !== undefined ? dto.name.trim() : cur.name;
  if (!name) throw new HttpError(400, "location name is required");
  let next: LocationEntity;
  if (dto.address !== undefined) {
    const addrRaw = dto.address.trim();
    if (!addrRaw) throw new HttpError(400, "location address is required");
    const resolved = resolveLocationAddressForSave(addrRaw);
    next = {
      ...cur,
      name,
      address: resolved.address,
      driveTimeMinutes: resolved.driveTimeMinutes,
      driveDistanceKm: resolved.driveDistanceKm,
    };
  } else {
    next = { ...cur, name };
  }
  const locations = prev.locations.map((l, i) => (i === idx ? next : l));
  const clientDrive = deriveClientDriveFromLocations(locations);
  const updated: ClientEntity = {
    ...prev,
    locations,
    driveTimeMinutes: clientDrive.driveTimeMinutes,
    driveDistanceKm: clientDrive.driveDistanceKm,
  };
  const db = await getMongoDb();
  const col = asDocCollection(db, COL.clients);
  const { id: _id, ...rest } = updated;
  await col.updateOne(filterById(clientId), { $set: { ...rest } });
  return { client: updated, location: next };
}

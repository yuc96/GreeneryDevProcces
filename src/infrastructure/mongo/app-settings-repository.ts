import type { Collection, Db, Filter } from "mongodb";
import { COL } from "@/infrastructure/mongo/collections";
import type { LaborEngineConfig } from "@/server/pricing/labor-engine-schema";
import type { PricingEngineConfig } from "@/server/pricing/engine-schema";

const PRICING_ID = "pricing_engine";
const LABOR_ID = "labor_engine";

function settingsCollection(db: Db): Collection<Record<string, unknown>> {
  return db.collection(COL.appSettings) as Collection<Record<string, unknown>>;
}

function byStringId(id: string): Filter<Record<string, unknown>> {
  return { _id: id } as unknown as Filter<Record<string, unknown>>;
}

export async function loadPricingPayload(
  db: Db,
): Promise<Record<string, unknown> | null> {
  const row = await settingsCollection(db).findOne(byStringId(PRICING_ID));
  if (!row || typeof row.payload !== "object" || row.payload === null) {
    return null;
  }
  return row.payload as Record<string, unknown>;
}

export async function savePricingPayload(
  db: Db,
  payload: PricingEngineConfig,
): Promise<void> {
  await settingsCollection(db).updateOne(
    byStringId(PRICING_ID),
    { $set: { _id: PRICING_ID, payload } },
    { upsert: true },
  );
}

export async function loadLaborPayload(
  db: Db,
): Promise<Record<string, unknown> | null> {
  const row = await settingsCollection(db).findOne(byStringId(LABOR_ID));
  if (!row || typeof row.payload !== "object" || row.payload === null) {
    return null;
  }
  return row.payload as Record<string, unknown>;
}

export async function saveLaborPayload(
  db: Db,
  payload: LaborEngineConfig,
): Promise<void> {
  await settingsCollection(db).updateOne(
    byStringId(LABOR_ID),
    { $set: { _id: LABOR_ID, payload } },
    { upsert: true },
  );
}

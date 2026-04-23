/**
 * Idempotent MongoDB seed: plant catalog, pots, staging, demo clients, pricing/labor configs, commission rows.
 * Usage: `MONGODB_URI=mongodb://localhost:27017 npm run db:seed`
 * Ensure `public/plants/reference/` contains the image files referenced by `src/data/plant-reference-images.json` (e.g. JJSS.png, JJDS.png).
 */
import "dotenv/config";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Collection, Filter } from "mongodb";
import { MongoClient } from "mongodb";
import { COL } from "../src/infrastructure/mongo/collections";
import { buildPlantCatalogDocuments } from "../src/infrastructure/seed/plant-catalog-builder";
import { buildPotCatalogDocuments } from "../src/infrastructure/seed/pot-catalog-builder";
import { buildStagingCatalogDocuments } from "../src/infrastructure/seed/staging-catalog-builder";
import { buildInitialClientEntities } from "../src/infrastructure/seed/clients-seed";
import { mergeWithPricingDefaults } from "../src/server/pricing/engine-schema";
import { mergeWithLaborDefaults } from "../src/server/pricing/labor-engine-schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function byId(_id: string | number): Filter<Record<string, unknown>> {
  return { _id } as unknown as Filter<Record<string, unknown>>;
}

function requireEnvUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is required (see .env.example)");
  }
  return uri;
}

async function main() {
  const uri = requireEnvUri();
  const dbName = process.env.MONGODB_DB_NAME?.trim() || "greenery_proposals";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const plantCol = db.collection(COL.plantCatalog) as Collection<
    Record<string, unknown>
  >;
  const potCol = db.collection(COL.potCatalog) as Collection<
    Record<string, unknown>
  >;
  const stagingCol = db.collection(COL.stagingCatalog) as Collection<
    Record<string, unknown>
  >;
  const clientsCol = db.collection(COL.clients) as Collection<
    Record<string, unknown>
  >;
  const settingsCol = db.collection(COL.appSettings) as Collection<
    Record<string, unknown>
  >;
  const commissionCol = db.collection(
    COL.commissionBeneficiaries,
  ) as Collection<Record<string, unknown>>;

  const plants = buildPlantCatalogDocuments();
  for (const p of plants) {
    const { _id, ...rest } = p as unknown as Record<string, unknown> & {
      _id: string;
    };
    await plantCol.updateOne(
      byId(_id),
      { $set: { _id, ...rest } },
      { upsert: true },
    );
  }
  console.log(`Seeded ${plants.length} plant catalog documents`);

  const pots = buildPotCatalogDocuments();
  for (const row of pots) {
    const { _id, ...rest } = row;
    await potCol.updateOne(
      byId(_id),
      { $set: { _id, ...rest } },
      { upsert: true },
    );
  }
  console.log(`Seeded ${pots.length} pot catalog rows`);

  const stagings = buildStagingCatalogDocuments();
  for (const s of stagings) {
    await stagingCol.updateOne(
      byId(s._id),
      { $set: s as unknown as Record<string, unknown> },
      { upsert: true },
    );
  }
  console.log(`Seeded ${stagings.length} staging catalog rows`);

  const clients = buildInitialClientEntities();
  for (const c of clients) {
    const { id, ...rest } = c;
    await clientsCol.updateOne(
      byId(id),
      { $set: { _id: id, ...rest } },
      { upsert: true },
    );
  }
  console.log(`Seeded ${clients.length} demo clients`);

  const pricingPath = join(root, "data", "pricing-engine.config.json");
  try {
    const raw = await readFile(pricingPath, "utf8");
    const merged = mergeWithPricingDefaults(JSON.parse(raw));
    await settingsCol.updateOne(
      byId("pricing_engine"),
      { $set: { _id: "pricing_engine", payload: merged as unknown } },
      { upsert: true },
    );
    console.log("Seeded pricing_engine from data/pricing-engine.config.json");
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : "";
    if (code === "ENOENT") {
      const merged = mergeWithPricingDefaults({});
      await settingsCol.updateOne(
        byId("pricing_engine"),
        { $set: { _id: "pricing_engine", payload: merged as unknown } },
        { upsert: true },
      );
      console.log("Seeded pricing_engine from defaults (no JSON file)");
    } else {
      throw e;
    }
  }

  const laborPath = join(root, "data", "labor-engine.config.json");
  try {
    const raw = await readFile(laborPath, "utf8");
    const parsed = JSON.parse(raw);
    const merged = mergeWithLaborDefaults(
      parsed && typeof parsed === "object" && Object.keys(parsed).length
        ? parsed
        : {},
    );
    await settingsCol.updateOne(
      byId("labor_engine"),
      { $set: { _id: "labor_engine", payload: merged as unknown } },
      { upsert: true },
    );
    console.log("Seeded labor_engine from data/labor-engine.config.json");
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : "";
    if (code === "ENOENT") {
      const merged = mergeWithLaborDefaults({});
      await settingsCol.updateOne(
        byId("labor_engine"),
        { $set: { _id: "labor_engine", payload: merged as unknown } },
        { upsert: true },
      );
      console.log("Seeded labor_engine from defaults (no JSON file)");
    } else {
      throw e;
    }
  }

  const commissionPath = join(root, "data", "commission-beneficiaries.json");
  try {
    const raw = await readFile(commissionPath, "utf8");
    const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const id = String(row.id ?? row._id ?? "");
        if (!id) continue;
        await commissionCol.updateOne(
          byId(id),
          { $set: { _id: id, ...row, id } },
          { upsert: true },
        );
      }
      console.log(`Seeded ${rows.length} commission beneficiaries`);
    }
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : "";
    if (code !== "ENOENT") throw e;
  }

  await client.close();
  console.log("db:seed completed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

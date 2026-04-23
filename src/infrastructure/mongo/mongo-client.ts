import { MongoClient } from "mongodb";
import { getServerEnv } from "@/infrastructure/env/server-env";

const globalKey = "__m01_mongo_client__" as const;

type GlobalMongo = typeof globalThis & {
  [globalKey]?: MongoClient;
};

export async function getMongoClient(): Promise<MongoClient> {
  const g = globalThis as GlobalMongo;
  if (g[globalKey]) return g[globalKey]!;
  const { MONGODB_URI } = getServerEnv();
  if (!MONGODB_URI?.trim()) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env (see .env.example) and run npm run db:seed.",
    );
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  g[globalKey] = client;
  return client;
}

export async function getMongoDb() {
  const { MONGODB_DB_NAME } = getServerEnv();
  const client = await getMongoClient();
  return client.db(MONGODB_DB_NAME);
}

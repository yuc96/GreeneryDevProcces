import type { Collection, Db, Filter } from "mongodb";

/**
 * Collections use string or numeric `_id` (not ObjectId). This wrapper avoids the
 * driver's default `Document` typing where `_id` is treated as `ObjectId`.
 */
export function asDocCollection(
  db: Db,
  name: string,
): Collection<Record<string, unknown>> {
  return db.collection(name) as Collection<Record<string, unknown>>;
}

export function filterById(id: string | number): Filter<Record<string, unknown>> {
  return { _id: id } as unknown as Filter<Record<string, unknown>>;
}

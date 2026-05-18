import { getDB } from "../db.ts";
import logger from "../logger.ts";

let collection: any = null;

/**
 * Initialize the neos collection with required indexes.
 */
export async function setupNeoCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection("neos");

  await collection.createIndex({ neoId: 1 }, { unique: true });
  await collection.createIndex({ closeApproachDate: -1 });
  await collection.createIndex({ isPotentiallyHazardous: 1 });

  logger.info("☄️  NEO collection indexes ready");
}

/**
 * Bulk upsert NEOs by NASA reference ID.
 */
export async function upsertNeos(neos: any) {
  if (!collection || neos.length === 0) return { upserted: 0, modified: 0 };

  const operations = neos.map((neo: any) => ({
    updateOne: {
      filter: { neoId: neo.neoId },
      update: {
        $set: { ...neo, lastSeen: new Date() },
        $setOnInsert: { firstSeen: new Date() },
      },
      upsert: true,
    },
  }));

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return { upserted: result.upsertedCount, modified: result.modifiedCount };
  } catch (error: any) {
    logger.error("Failed to upsert NEOs:", error.message);
    return { upserted: 0, modified: 0 };
  }
}

/**
 * Query recent NEOs from the database.
 */
export async function getRecentNeos(
  days: any = 7,
  hazardousOnly: any = false,
  limit: any = 100,
) {
  if (!collection) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const query: Record<string, any> = { lastSeen: { $gte: cutoff } };
  if (hazardousOnly) query.isPotentiallyHazardous = true;

  return collection
    .find(query)
    .sort({ missDistanceKm: 1 })
    .limit(limit)
    .toArray();
}

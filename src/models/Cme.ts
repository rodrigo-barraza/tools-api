import { getDB } from "../db.ts";
import logger from "../logger.ts";

let collection: any = null;

export async function setupCmeCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection("cmes");

  await collection.createIndex({ activityId: 1 }, { unique: true });
  await collection.createIndex({ startTime: -1 });
  await collection.createIndex({ isEarthDirected: 1 });

  logger.info("💥 CME collection indexes ready");
}

export async function upsertCmes(cmes: any) {
  if (!collection || cmes.length === 0) return { upserted: 0, modified: 0 };

  const operations = cmes.map((cme: any) => ({
    updateOne: {
      filter: { activityId: cme.activityId },
      update: {
        $set: { ...cme, lastSeen: new Date() },
        $setOnInsert: { firstSeen: new Date() },
      },
      upsert: true,
    },
  }));

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return { upserted: result.upsertedCount, modified: result.modifiedCount };
  } catch (error: unknown) {
    logger.error("Failed to upsert CMEs:", (error as Error).message);
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentCmes(
  days: any = 7,
  earthDirectedOnly: any = false,
  limit: any = 50,
) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const query: Record<string, any> = { startTime: { $gte: cutoff } };
  if (earthDirectedOnly) query.isEarthDirected = true;
  return collection.find(query).sort({ startTime: -1 }).limit(limit).toArray();
}

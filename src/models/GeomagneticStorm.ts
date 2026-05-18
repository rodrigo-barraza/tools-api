import { getDB } from "../db.ts";
import logger from "../logger.ts";

let collection: any = null;

export async function setupGeomagneticStormCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection("geomagnetic_storms");

  await collection.createIndex({ gstId: 1 }, { unique: true });
  await collection.createIndex({ startTime: -1 });

  logger.info("🧲 Geomagnetic storm collection indexes ready");
}

export async function upsertGeomagneticStorms(storms: any) {
  if (!collection || storms.length === 0) return { upserted: 0, modified: 0 };

  const operations = storms.map((gst: any) => ({
    updateOne: {
      filter: { gstId: gst.gstId },
      update: {
        $set: { ...gst, lastSeen: new Date() },
        $setOnInsert: { firstSeen: new Date() },
      },
      upsert: true,
    },
  }));

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return { upserted: result.upsertedCount, modified: result.modifiedCount };
  } catch (error: any) {
    logger.error("Failed to upsert geomagnetic storms:", error.message);
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentStorms(days: any = 30, limit: any = 20) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return collection
    .find({ startTime: { $gte: cutoff } })
    .sort({ startTime: -1 })
    .limit(limit)
    .toArray();
}

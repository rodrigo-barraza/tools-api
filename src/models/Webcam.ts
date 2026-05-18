import { getDB } from "../db.ts";
import logger from "../logger.ts";

let collection: any = null;

export async function setupWebcamCollection() {
  const db = getDB();
  if (!db) return;
  
  collection = db.collection("webcams");

  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ city: 1 });
  await collection.createIndex({ lastUpdated: -1 });

  logger.info("📷 Webcam collection indexes ready");
}

export async function upsertWebcams(webcams: any) {
  if (!collection || webcams.length === 0) return null;

  const now = new Date();
  const operations = webcams.map((cam: any) => ({
    updateOne: {
      filter: { id: cam.id },
      update: {
        $set: { ...cam, lastUpdated: now },
        $setOnInsert: { firstSeen: now },
      },
      upsert: true,
    },
  }));

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return result;
  } catch (error: any) {
    logger.error("Failed to upsert webcams:", error.message);
    return null;
  }
}

export async function getWebcamsByCity(city: any, limit: any = 100) {
  if (!collection) return [];
  // Exclude mongodb _id from results so it's clean
  return collection.find({ city }, { projection: { _id: 0, lastUpdated: 0, firstSeen: 0 } }).limit(limit).toArray();
}

export async function getWebcamsLastUpdated(city: any) {
  if (!collection) return null;
  const latest = await collection.find({ city }).sort({ lastUpdated: -1 }).limit(1).toArray();
  return latest.length > 0 ? latest[0].lastUpdated : null;
}

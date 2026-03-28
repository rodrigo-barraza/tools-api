import { getDB } from "../db.js";

let collection = null;

export async function setupGeomagneticStormCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection("geomagnetic_storms");

  await collection.createIndex({ gstId: 1 }, { unique: true });
  await collection.createIndex({ startTime: -1 });

  console.log("🧲 Geomagnetic storm collection indexes ready");
}

export async function upsertGeomagneticStorms(storms) {
  if (!collection || storms.length === 0) return { upserted: 0, modified: 0 };

  const operations = storms.map((gst) => ({
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
  } catch (error) {
    console.error("Failed to upsert geomagnetic storms:", error.message);
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentStorms(days = 30, limit = 20) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return collection
    .find({ startTime: { $gte: cutoff } })
    .sort({ startTime: -1 })
    .limit(limit)
    .toArray();
}

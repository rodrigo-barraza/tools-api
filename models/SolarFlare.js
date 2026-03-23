import { getDB } from "../db.js";

let collection = null;

export async function setupSolarFlareCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection("solarFlares");

  await collection.createIndex({ flrId: 1 }, { unique: true });
  await collection.createIndex({ peakTime: -1 });
  await collection.createIndex({ classType: 1 });

  console.log("☀️  Solar flare collection indexes ready");
}

export async function upsertSolarFlares(flares) {
  if (!collection || flares.length === 0) return { upserted: 0, modified: 0 };

  const operations = flares.map((flr) => ({
    updateOne: {
      filter: { flrId: flr.flrId },
      update: {
        $set: { ...flr, lastSeen: new Date() },
        $setOnInsert: { firstSeen: new Date() },
      },
      upsert: true,
    },
  }));

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return { upserted: result.upsertedCount, modified: result.modifiedCount };
  } catch (error) {
    console.error("Failed to upsert solar flares:", error.message);
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentSolarFlares(days = 7, limit = 50) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return collection
    .find({ peakTime: { $gte: cutoff } })
    .sort({ peakTime: -1 })
    .limit(limit)
    .toArray();
}

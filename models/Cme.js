import { getDB } from "../db.js";

let collection = null;

export async function setupCmeCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection("cmes");

  await collection.createIndex({ activityId: 1 }, { unique: true });
  await collection.createIndex({ startTime: -1 });
  await collection.createIndex({ isEarthDirected: 1 });

  console.log("💥 CME collection indexes ready");
}

export async function upsertCmes(cmes) {
  if (!collection || cmes.length === 0) return { upserted: 0, modified: 0 };

  const operations = cmes.map((cme) => ({
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
  } catch (error) {
    console.error("Failed to upsert CMEs:", error.message);
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentCmes(
  days = 7,
  earthDirectedOnly = false,
  limit = 50,
) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const query = { startTime: { $gte: cutoff } };
  if (earthDirectedOnly) query.isEarthDirected = true;
  return collection.find(query).sort({ startTime: -1 }).limit(limit).toArray();
}

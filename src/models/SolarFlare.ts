import type { Collection } from "mongodb";
import { getDB } from "../db.ts";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface SolarFlareDocument {
  flrId: string;
  peakTime?: Date | null;
  classType?: string;
  lastSeen?: Date;
  firstSeen?: Date;
  [key: string]: unknown;
}

let collection: Collection<SolarFlareDocument> | null = null;

export async function setupSolarFlareCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection<SolarFlareDocument>("solar_flares");

  await collection.createIndex({ flrId: 1 }, { unique: true });
  await collection.createIndex({ peakTime: -1 });
  await collection.createIndex({ classType: 1 });

  logger.info("☀️  Solar flare collection indexes ready");
}

export async function upsertSolarFlares(flares: SolarFlareDocument[]) {
  if (!collection || flares.length === 0) return { upserted: 0, modified: 0 };

  const operations = flares.map((flr: SolarFlareDocument) => ({
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
  } catch (error: unknown) {
    logger.error("Failed to upsert solar flares:", (error as Error).message);
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentSolarFlares(days: number = 7, limit: number = 50) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return collection
    .find({ peakTime: { $gte: cutoff } })
    .sort({ peakTime: -1 })
    .limit(limit)
    .toArray();
}

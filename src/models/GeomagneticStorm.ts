import type { Collection } from "mongodb";
import { getDB } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface GeomagneticStormDocument {
  gstId: string;
  startTime?: Date | null;
  lastSeen?: Date;
  firstSeen?: Date;
  [key: string]: unknown;
}

let collection: Collection<GeomagneticStormDocument> | null = null;

export async function setupGeomagneticStormCollection() {
  const database = getDB();
  if (!database) throw new Error("Database not connected");

  collection =
    database.collection<GeomagneticStormDocument>("geomagnetic_storms");

  await collection.createIndex({ gstId: 1 }, { unique: true });
  await collection.createIndex({ startTime: -1 });

  logger.info("🧲 Geomagnetic storm collection indexes ready");
}

export async function upsertGeomagneticStorms(
  storms: GeomagneticStormDocument[],
) {
  if (!collection || storms.length === 0) return { upserted: 0, modified: 0 };

  const operations = storms.map((gst: GeomagneticStormDocument) => ({
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
  } catch (error: unknown) {
    logger.error("Failed to upsert geomagnetic storms:", errorMessage(error));
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentStorms(days: number = 30, limit: number = 20) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return collection
    .find({ startTime: { $gte: cutoff } })
    .sort({ startTime: -1 })
    .limit(limit)
    .toArray();
}

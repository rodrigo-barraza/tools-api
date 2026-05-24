import type { Collection } from "mongodb";
import { getDB } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface NeoDocument {
  neoId: string;
  closeApproachDate?: string | Date;
  isPotentiallyHazardous?: boolean;
  missDistanceKm?: number | null;
  lastSeen?: Date;
  firstSeen?: Date;
  [key: string]: unknown;
}

let collection: Collection<NeoDocument> | null = null;

/**
 * Initialize the neos collection with required indexes.
 */
export async function setupNeoCollection() {
  const db = getDB();
  if (!db) throw new Error("Database not connected");

  collection = db.collection<NeoDocument>("neos");

  await collection.createIndex({ neoId: 1 }, { unique: true });
  await collection.createIndex({ closeApproachDate: -1 });
  await collection.createIndex({ isPotentiallyHazardous: 1 });

  logger.info("☄️  NEO collection indexes ready");
}

/**
 * Bulk upsert NEOs by NASA reference ID.
 */
export async function upsertNeos(neos: NeoDocument[]) {
  if (!collection || neos.length === 0) return { upserted: 0, modified: 0 };

  const operations = neos.map((neo: NeoDocument) => ({
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
  } catch (error: unknown) {
    logger.error("Failed to upsert NEOs:", errorMessage(error));
    return { upserted: 0, modified: 0 };
  }
}

/**
 * Query recent NEOs from the database.
 */
export async function getRecentNeos(
  days: number = 7,
  hazardousOnly: boolean = false,
  limit: number = 100,
) {
  if (!collection) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const query: Record<string, unknown> = { lastSeen: { $gte: cutoff } };
  if (hazardousOnly) query.isPotentiallyHazardous = true;

  return collection
    .find(query)
    .sort({ missDistanceKm: 1 })
    .limit(limit)
    .toArray();
}

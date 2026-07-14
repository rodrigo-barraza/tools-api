import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
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
  const database = getDatabase();
  if (!database) throw new Error("Database not connected");

  const collectionInstance = database.collection<NeoDocument>("neos") as unknown as Collection<NeoDocument>;

  await collectionInstance.createIndex({ neoId: 1 }, { unique: true });
  await collectionInstance.createIndex({ closeApproachDate: -1 });
  await collectionInstance.createIndex({ isPotentiallyHazardous: 1 });

  collection = collectionInstance;
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

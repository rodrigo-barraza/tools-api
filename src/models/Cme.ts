import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface CmeDocument {
  activityId: string;
  startTime?: Date | null;
  isEarthDirected?: boolean;
  lastSeen?: Date;
  firstSeen?: Date;
  [key: string]: unknown;
}

let collection: Collection<CmeDocument> | null = null;

export async function setupCmeCollection() {
  const database = getDatabase();
  if (!database) throw new Error("Database not connected");

  const collectionInstance = database.collection<CmeDocument>("cmes") as unknown as Collection<CmeDocument>;

  await collectionInstance.createIndex({ activityId: 1 }, { unique: true });
  await collectionInstance.createIndex({ startTime: -1 });
  await collectionInstance.createIndex({ isEarthDirected: 1 });

  collection = collectionInstance;
  logger.info("💥 CME collection indexes ready");
}

export async function upsertCmes(cmes: CmeDocument[]) {
  if (!collection || cmes.length === 0) return { upserted: 0, modified: 0 };

  const operations = cmes.map((cme: CmeDocument) => ({
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
    logger.error("Failed to upsert CMEs:", errorMessage(error));
    return { upserted: 0, modified: 0 };
  }
}

export async function getRecentCmes(
  days: number = 7,
  earthDirectedOnly: boolean = false,
  limit: number = 50,
) {
  if (!collection) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const query: Record<string, unknown> = { startTime: { $gte: cutoff } };
  if (earthDirectedOnly) query.isEarthDirected = true;
  return collection.find(query).sort({ startTime: -1 }).limit(limit).toArray();
}

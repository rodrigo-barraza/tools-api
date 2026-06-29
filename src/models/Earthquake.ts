import type { Collection } from "mongodb";
import { hours as hoursToMs } from "@rodrigo-barraza/utilities-library";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface EarthquakeDocument {
  usgsId: string;
  time?: Date;
  magnitude?: number | null;
  lastSeen?: Date;
  firstSeen?: Date;
  [key: string]: unknown;
}

let collection: Collection<EarthquakeDocument> | null = null;

/**
 * Initialize the earthquakes collection with required indexes.
 * Called once during startup after MongoDB connection is established.
 */
export async function setupEarthquakeCollection() {
  const database = getDatabase();
  if (!database) throw new Error("Database not connected");

  const collectionInstance = database.collection<EarthquakeDocument>("earthquakes") as unknown as Collection<EarthquakeDocument>;

  await collectionInstance.createIndex({ usgsId: 1 }, { unique: true });
  await collectionInstance.createIndex({ time: -1 });
  await collectionInstance.createIndex({ magnitude: -1 });

  collection = collectionInstance;
  logger.info("🌍 Earthquake collection indexes ready");
}

/**
 * Bulk upsert earthquake events by USGS ID.
 * Updates existing events (e.g. revised magnitude) and inserts new ones.
 */
export async function upsertEarthquakes(events: EarthquakeDocument[]) {
  if (!collection || events.length === 0) return;

  const operations = events.map((event: EarthquakeDocument) => ({
    updateOne: {
      filter: { usgsId: event.usgsId },
      update: {
        $set: { ...event, lastSeen: new Date() },
        $setOnInsert: { firstSeen: new Date() },
      },
      upsert: true,
    },
  }));

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return {
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    };
  } catch (error: unknown) {
    logger.error("Failed to upsert earthquakes:", errorMessage(error));
    return { upserted: 0, modified: 0 };
  }
}

/**
 * Query recent earthquakes from the database.


 */
export async function getRecentEarthquakes(
  hours: number = 24,
  minMagnitude: number | null = null,
  limit: number = 100,
) {
  if (!collection) return [];

  const cutoff = new Date(Date.now() - hoursToMs(hours));
  const query: Record<string, unknown> = { time: { $gte: cutoff } };

  if (minMagnitude !== null) {
    query.magnitude = { $gte: minMagnitude };
  }

  return collection.find(query).sort({ time: -1 }).limit(limit).toArray();
}

/**
 * Get a single earthquake event by its USGS ID.
 */
export async function getEarthquakeById(usgsId: string) {
  if (!collection) return null;
  return collection.findOne({ usgsId });
}

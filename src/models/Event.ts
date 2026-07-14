import type { Collection } from "mongodb";
import { days as daysToMs } from "@rodrigo-barraza/utilities-library";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface EventVenue {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

export interface EventDocument {
  sourceId: string;
  source: string;
  name: string;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  venue?: EventVenue;
  url?: string;
  imageUrl?: string;
  mapImageUrl?: string;
  priceRange?: string;
  status?: string;
  description?: string;
  firstSeen?: Date;
  lastSeen?: Date;
}

interface SearchOptions {
  value?: string;
  category?: string;
  city?: string;
  source?: string;
  limit?: number;
}

// ─── Collection Reference ───────────────────────────────────────
let collection: Collection<EventDocument> | null = null;

/**
 * Initialize the events collection with required indexes.
 */
export async function setupEventCollection(): Promise<void> {
  const database = getDatabase();
  const collectionInstance = database.collection<EventDocument>("events") as unknown as Collection<EventDocument>;

  await collectionInstance.createIndex({ sourceId: 1, source: 1 }, { unique: true });
  await collectionInstance.createIndex({ startDate: -1 });
  await collectionInstance.createIndex({ startDate: 1 });
  await collectionInstance.createIndex({ category: 1 });
  await collectionInstance.createIndex({ "venue.city": 1 });
  await collectionInstance.createIndex({ source: 1 });
  await collectionInstance.createIndex(
    { name: "text", "venue.name": "text", "venue.city": "text" },
    { name: "event_text_search" },
  );

  collection = collectionInstance;
  logger.info("📅 Event collection indexes ready");
}

/**
 * Bulk upsert events by sourceId + source.
 */
export async function upsertEvents(
  events: EventDocument[],
): Promise<{ upserted: number; modified: number }> {
  if (!collection || events.length === 0) return { upserted: 0, modified: 0 };

  const operations = events.map((event: EventDocument) => ({
    updateOne: {
      filter: { sourceId: event.sourceId, source: event.source },
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
    logger.error("Failed to upsert events:", errorMessage(error));
    return { upserted: 0, modified: 0 };
  }
}

/**
 * Get events happening today (local time boundaries).
 */
export async function getEventsToday(
  timezone: string,
): Promise<EventDocument[]> {
  if (!collection) return [];

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayString = formatter.format(now);
  const startOfDay = new Date(`${todayString}T00:00:00`);
  const endOfDay = new Date(`${todayString}T23:59:59.999`);

  return collection
    .find({ startDate: { $gte: startOfDay, $lte: endOfDay } })
    .sort({ startDate: 1 })
    .toArray();
}

/**
 * Get upcoming events (next N days from now).
 */
export async function getEventsUpcoming(
  days: number = 30,
  limit: number = 200,
): Promise<EventDocument[]> {
  if (!collection) return [];

  const now = new Date();
  const cutoff = new Date(now.getTime() + daysToMs(days));

  return collection
    .find({ startDate: { $gte: now, $lte: cutoff } })
    .sort({ startDate: 1 })
    .limit(limit)
    .toArray();
}

/**
 * Get past events (last N days).
 */
export async function getEventsPast(
  days: number = 30,
  limit: number = 200,
): Promise<EventDocument[]> {
  if (!collection) return [];

  const now = new Date();
  const cutoff = new Date(now.getTime() - daysToMs(days));

  return collection
    .find({ startDate: { $gte: cutoff, $lt: now } })
    .sort({ startDate: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Search events by text query with optional filters.
 */
export async function searchEvents({
  value,
  category,
  city,
  source,
  limit = 100,
}: SearchOptions = {}): Promise<EventDocument[]> {
  if (!collection) return [];

  const query: Record<string, unknown> = {};

  if (value) query.$text = { $search: value };
  if (category) query.category = category;
  if (city) query["venue.city"] = new RegExp(city, "i");
  if (source) query.source = source;

  if (!source) {
    query.startDate = { $gte: new Date() };
  }

  const cursor = value
    ? collection
        .find(query, { score: { $meta: "textScore" } } as Record<
          string,
          unknown
        >)
        .sort({ score: { $meta: "textScore" } })
    : collection.find(query).sort({ startDate: 1 });

  return cursor.limit(limit).toArray();
}

/**
 * Get a single event by source and sourceId.
 */
export async function getEventBySourceId(
  source: string,
  sourceId: string,
): Promise<EventDocument | null> {
  if (!collection) return null;
  return collection.findOne({ source, sourceId });
}

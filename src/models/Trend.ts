import type { AnyBulkWriteOperation, ObjectId } from "mongodb";
import { hours as hoursToMs } from "@rodrigo-barraza/utilities-library";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface TrendInput {
  name: string;
  normalizedName: string;
  source: string;
  category?: string | null;
  volume?: number;
  url?: string | null;
  context?: Record<string, unknown>;
}

export interface TrendDoc {
  name: string;
  normalizedName: string;
  source: string;
  category: string | null;
  volume: number;
  url: string | null;
  context: Record<string, unknown>;
  lastSeen: Date;
  firstSeen: Date;
  appearances: { timestamp: Date; volume: number }[];
}

export interface AggregatedTrend {
  normalizedName: string;
  name: string;
  sources: string[];
  sourceCount: number;
  totalVolume: number;
  category: string | null;
  lastSeen: Date;
  firstSeen: Date;
  urls: (string | null)[];
}


/**
 * Sets up the trends collection with indexes.
 */
export async function setupTrendCollection() {
  const database = getDatabase();
  const collection = database.collection("trends");
  await collection.createIndex({ normalizedName: 1, source: 1 });
  await collection.createIndex({ lastSeen: -1 });
  await collection.createIndex({ category: 1 });
  await collection.createIndex({ source: 1 });
  await collection.createIndex({ volume: -1 });
  logger.info("📈 Trend collection indexes ready");
}

/**
 * Upserts an array of trend objects into the database.
 */
export async function upsertTrends(trends: TrendInput[]) {
  if (!trends.length) return { upserted: 0, modified: 0 };

  const database = getDatabase();
  const collection = database.collection<TrendDoc>("trends");
  const now = new Date();

  const bulkOps: AnyBulkWriteOperation<TrendDoc>[] = trends.map(
    (trend: TrendInput) => ({
      updateOne: {
        filter: {
          normalizedName: trend.normalizedName,
          source: trend.source,
        },
        update: {
          $set: {
            name: trend.name,
            normalizedName: trend.normalizedName,
            source: trend.source,
            category: trend.category || null,
            volume: trend.volume || 0,
            url: trend.url || null,
            context: trend.context || {},
            lastSeen: now,
          },
          $setOnInsert: { firstSeen: now },
          $push: {
            appearances: {
              $each: [{ timestamp: now, volume: trend.volume || 0 }],
              $slice: -100,
            },
          },
        },
        upsert: true,
      },
    }),
  );

  const result = await collection.bulkWrite(bulkOps, { ordered: false });
  return {
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
  };
}

/**
 * Gets recent trends from the database.
 */
export async function getRecentTrends(
  hours: number = 24,
  category: string | null = null,
  source: string | null = null,
  limit: number = 50,
): Promise<(TrendDoc & { _id: ObjectId })[]> {
  const database = getDatabase();
  const collection = database.collection<TrendDoc>("trends");
  const since = new Date(Date.now() - hoursToMs(hours));

  const filter: Record<string, unknown> = { lastSeen: { $gte: since } };
  if (category) filter.category = category;
  if (source) filter.source = source;

  return collection.find(filter).sort({ volume: -1 }).limit(limit).toArray();
}

/**
 * Searches trends in the database by keyword.
 */
export async function searchTrendsDB(query: string, limit: number = 50): Promise<(TrendDoc & { _id: ObjectId })[]> {
  const database = getDatabase();
  const collection = database.collection<TrendDoc>("trends");
  return collection
    .find({ name: { $regex: query, $options: "i" } })
    .sort({ lastSeen: -1, volume: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Gets top trends aggregated across all sources.
 */
export async function getTopTrends(hours: number = 24, limit: number = 20): Promise<AggregatedTrend[]> {
  const database = getDatabase();
  const collection = database.collection<TrendDoc>("trends");
  const since = new Date(Date.now() - hoursToMs(hours));

  return collection
    .aggregate<AggregatedTrend>([
      { $match: { lastSeen: { $gte: since } } },
      {
        $group: {
          _id: "$normalizedName",
          name: { $first: "$name" },
          sources: { $addToSet: "$source" },
          totalVolume: { $sum: "$volume" },
          category: { $first: "$category" },
          lastSeen: { $max: "$lastSeen" },
          firstSeen: { $min: "$firstSeen" },
          urls: { $push: "$url" },
        },
      },
      {
        $project: {
          _id: 0,
          normalizedName: "$_id",
          name: 1,
          sources: 1,
          sourceCount: { $size: "$sources" },
          totalVolume: 1,
          category: 1,
          lastSeen: 1,
          firstSeen: 1,
          urls: { $slice: ["$urls", 3] },
        },
      },
      { $sort: { sourceCount: -1, totalVolume: -1 } },
      { $limit: limit },
    ])
    .toArray();
}

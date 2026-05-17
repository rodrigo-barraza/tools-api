import { hours as hoursToMs } from "@rodrigo-barraza/utilities-library";
import { getDB } from "../db.ts";
import logger from "../logger.ts";

/**
 * Set up the commodity_snapshots collection with a TTL index.
 */
export async function setupCommodityCollection() {
  const db = getDB();
  const collection = db.collection("commodity_snapshots");

  await collection.createIndex({ fetchedAt: -1 });
  await collection.createIndex({ ticker: 1, fetchedAt: -1 });

  logger.info("💰 commodity_snapshots collection ready");
}

/**
 * Insert a batch of commodity snapshots.
 */
export async function insertSnapshots(quotes) {
  if (!quotes.length) return;

  const db = getDB();
  const collection = db.collection("commodity_snapshots");
  const docs = quotes.map((q) => ({
    ...q,
    fetchedAt: new Date(q.fetchedAt),
  }));

  const result = await collection.insertMany(docs);
  return { inserted: result.insertedCount };
}

/**
 * Get historical price data for a specific ticker.
 */
export async function getHistory(ticker, hours = 24) {
  const db = getDB();
  const collection = db.collection("commodity_snapshots");
  const since = new Date(Date.now() - hoursToMs(hours));

  return collection
    .find({ ticker, fetchedAt: { $gte: since } })
    .sort({ fetchedAt: -1 })
    .toArray();
}

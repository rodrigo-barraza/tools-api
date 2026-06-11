import { hours as hoursToMs } from "@rodrigo-barraza/utilities-library";
import { getDB } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface CommodityQuoteInput {
  ticker: string;
  fetchedAt: string | Date;
  [key: string]: unknown;
}

/**
 * Set up the commodity_snapshots collection with a TTL index.
 */
export async function setupCommodityCollection() {
  const database = getDB();
  const collection = database.collection("commodity_snapshots");

  await collection.createIndex({ fetchedAt: -1 });
  await collection.createIndex({ ticker: 1, fetchedAt: -1 });

  logger.info("💰 commodity_snapshots collection ready");
}

/**
 * Insert a batch of commodity snapshots.
 */
export async function insertSnapshots(quotes: CommodityQuoteInput[]) {
  if (!quotes.length) return;

  const database = getDB();
  const collection = database.collection("commodity_snapshots");
  const docs = quotes.map((commodityQuoteInput: CommodityQuoteInput) => ({
    ...commodityQuoteInput,
    fetchedAt: new Date(commodityQuoteInput.fetchedAt),
  }));

  const result = await collection.insertMany(docs);
  return { inserted: result.insertedCount };
}

/**
 * Get historical price data for a specific ticker.
 */
export async function getHistory(ticker: string, hours: number = 24) {
  const database = getDB();
  const collection = database.collection("commodity_snapshots");
  const since = new Date(Date.now() - hoursToMs(hours));

  return collection
    .find({ ticker, fetchedAt: { $gte: since } })
    .sort({ fetchedAt: -1 })
    .toArray();
}

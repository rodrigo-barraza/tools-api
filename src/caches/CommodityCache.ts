import { insertSnapshots } from "../models/CommoditySnapshot.ts";

/**
 * In-memory cache for the latest commodity quotes.
 * Follows the Nimbus cache pattern — update/get/health/error.
 */

// ─── Types ─────────────────────────────────────────────────────────

interface CommodityQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
  category: string;
}

interface CommoditySummaryEntry {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  unit: string;
}

// ─── Cache ─────────────────────────────────────────────────────────

const cache = {
  commodities: [] as CommodityQuote[],
  lastFetch: null as Date | null,
  error: null as { message: string; time: string } | null,
};

// ─── Setters ───────────────────────────────────────────────────────

/**
 * Update the cache with freshly fetched commodity quotes.
 * Persists to MongoDB as timestamped snapshots.
 */
export async function updateCommodities(quotes: CommodityQuote[]) {
  cache.commodities = quotes;
  cache.lastFetch = new Date();
  cache.error = null;

  const result = await insertSnapshots(
    quotes.map((query) => ({
      ...query,
      fetchedAt: cache.lastFetch || new Date(),
    })),
  );
  return result;
}

/**
 * Restore commodities from a DB snapshot into the in-memory cache.
 * Memory-only — no MongoDB snapshot insertion.
 */
export function restoreCommodities(quotes: CommodityQuote[]) {
  cache.commodities = quotes;
  cache.lastFetch = new Date();
  cache.error = null;
}

/**
 * Record a fetch error.
 */
export function setCommodityError(error: { message: string }) {
  cache.error = {
    message: error.message,
    time: new Date().toISOString(),
  };
}

// ─── Getters ───────────────────────────────────────────────────────

/**
 * Get all latest commodity quotes.
 */
export function getAllCommodities() {
  return [...cache.commodities];
}

/**
 * Get commodities filtered by category.
 */
export function getCommoditiesByCategory(category: string) {
  return cache.commodities.filter((item) => item.category === category);
}

/**
 * Get a single commodity by ticker symbol.
 */
export function getCommodityByTicker(ticker: string) {
  return cache.commodities.find(
    (commodityQuote) => commodityQuote.ticker.toUpperCase() === ticker.toUpperCase(),
  );
}

/**
 * Get a market overview summary — totals, top gainers, top losers, by category.
 */
export function getCommoditySummary() {
  const commodities = cache.commodities;

  if (!commodities.length) {
    return { total: 0, lastFetch: cache.lastFetch };
  }

  // Sort by changePercent for gainers/losers
  const withChange = commodities.filter((item) => item.changePercent != null);
  const sorted = [...withChange].sort(
    (commodityQuote, b) => b.changePercent - commodityQuote.changePercent,
  );

  const gainers = sorted.slice(0, 5).map(summarize);
  const losers = sorted.slice(-5).reverse().map(summarize);

  // Group by category
  const byCategory: Record<string, CommoditySummaryEntry[]> = {};
  for (const item of commodities) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = [];
    }
    byCategory[item.category].push(summarize(item));
  }

  return {
    total: commodities.length,
    lastFetch: cache.lastFetch,
    gainers,
    losers,
    byCategory,
  };
}

/**
 * Get commodity health info for the /health endpoint.
 */
export function getCommodityHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    tickerCount: cache.commodities.length,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function summarize(commodityQuote: CommodityQuote): CommoditySummaryEntry {
  return {
    ticker: commodityQuote.ticker,
    name: commodityQuote.name,
    price: commodityQuote.price,
    change: commodityQuote.change,
    changePercent: commodityQuote.changePercent,
    unit: commodityQuote.unit,
  };
}

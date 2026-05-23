import { TREND_SOURCES } from "../constants.ts";

// ─── Types ─────────────────────────────────────────────────────────

export interface CachedTrend {
  name: string;
  normalizedName: string;
  source: string;
  category?: string;
  volume?: number;
  url?: string;
  context?: Record<string, unknown>;
}

interface TrendSourceData {
  trends: CachedTrend[];
  lastFetch: string | null;
  error: { message: string; time: string } | null;
}

interface CorrelatedTopic {
  name: string;
  normalizedName: string;
  sources: Set<string>;
  totalVolume: number;
  entries: CachedTrend[];
}

// ─── In-Memory Cache ───────────────────────────────────────────────

const cache: Record<string, TrendSourceData> = {};

// Initialize cache slots for each source
for (const source of Object.values(TREND_SOURCES)) {
  cache[source] = {
    trends: [],
    lastFetch: null,
    error: null,
  };
}

// ─── Cache Update ──────────────────────────────────────────────────

/**
 * Updates the cache for a given source with fresh trend data.


 */
export function updateTrends(source: string, trends: CachedTrend[]) {
  cache[source] = {
    trends,
    lastFetch: new Date().toISOString(),
    error: null,
  };
}

/**
 * Records an error for the given source.


 */
export function setTrendError(source: string, error: { message: string }) {
  if (cache[source]) {
    cache[source].error = {
      message: error.message,
      time: new Date().toISOString(),
    };
  }
}

// ─── Cache Queries ─────────────────────────────────────────────────

/**
 * Returns all cached trends across all sources.
 */
export function getAll() {
  const allTrends: CachedTrend[] = [];
  const sourceSummary: Record<string, { count: number; lastFetch: string | null }> = {};

  for (const [source, data] of Object.entries(cache)) {
    allTrends.push(...data.trends);
    sourceSummary[source] = {
      count: data.trends.length,
      lastFetch: data.lastFetch,
    };
  }

  return {
    count: allTrends.length,
    sources: sourceSummary,
    trends: allTrends.sort((a, b) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Returns cached trends from a specific source.

 */
export function getBySource(source: string) {
  const data = cache[source];
  if (!data) {
    return { count: 0, source, lastFetch: null, trends: [] as CachedTrend[] };
  }
  return {
    count: data.trends.length,
    source,
    lastFetch: data.lastFetch,
    trends: data.trends.sort((a, b) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Returns cached trends filtered by category.

 */
export function getByCategory(category: string) {
  const allTrends: CachedTrend[] = [];
  for (const data of Object.values(cache)) {
    allTrends.push(
      ...data.trends.filter(
        (t) =>
          t.category && t.category.toLowerCase() === category.toLowerCase(),
      ),
    );
  }

  return {
    count: allTrends.length,
    category,
    trends: allTrends.sort((a, b) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Finds cross-source correlated trends — topics appearing in 2+ sources.
 * Uses normalized name matching to find overlapping topics.
 */
export function getCorrelatedTrends() {
  // Build a map of normalizedName → { sources, totalVolume, entries }
  const topicMap = new Map<string, CorrelatedTopic>();

  for (const data of Object.values(cache)) {
    for (const trend of data.trends) {
      const key = trend.normalizedName;
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          name: trend.name,
          normalizedName: key,
          sources: new Set(),
          totalVolume: 0,
          entries: [],
        });
      }
      const topic = topicMap.get(key)!;
      topic.sources.add(trend.source);
      topic.totalVolume += trend.volume || 0;
      topic.entries.push(trend);
    }
  }

  // Filter to topics in 2+ sources
  const correlated = Array.from(topicMap.values())
    .filter((t) => t.sources.size >= 2)
    .map((t) => ({
      name: t.name,
      normalizedName: t.normalizedName,
      sourceCount: t.sources.size,
      sources: Array.from(t.sources),
      totalVolume: t.totalVolume,
      entries: t.entries,
    }))
    .sort(
      (a, b) => b.sourceCount - a.sourceCount || b.totalVolume - a.totalVolume,
    );

  return {
    count: correlated.length,
    trends: correlated,
  };
}

/**
 * Searches cached trends by keyword (case-insensitive).

 */
export function searchTrends(query: string) {
  const normalizedQuery = query.toLowerCase();
  const allTrends: CachedTrend[] = [];

  for (const data of Object.values(cache)) {
    allTrends.push(
      ...data.trends.filter(
        (t) => t.name.toLowerCase().includes(normalizedQuery) || t.normalizedName.includes(normalizedQuery),
      ),
    );
  }

  return {
    count: allTrends.length,
    query,
    trends: allTrends.sort((a, b) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Returns health status for all collectors.
 */
export function getHealth() {
  const health: Record<string, { trendCount: number; lastFetch: string | null; error: TrendSourceData["error"] }> = {};
  for (const [source, data] of Object.entries(cache)) {
    health[source] = {
      trendCount: data.trends.length,
      lastFetch: data.lastFetch,
      error: data.error,
    };
  }
  return health;
}

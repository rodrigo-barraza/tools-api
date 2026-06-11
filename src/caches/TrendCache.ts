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
  const sourceSummary: Record<
    string,
    { count: number; lastFetch: string | null }
  > = {};

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
    trends: allTrends.sort(
      (firstItem, b) => (b.volume || 0) - (firstItem.volume || 0),
    ),
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
    trends: data.trends.sort(
      (firstItem, b) => (b.volume || 0) - (firstItem.volume || 0),
    ),
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
        (cachedTrend) =>
          cachedTrend.category && cachedTrend.category.toLowerCase() === category.toLowerCase(),
      ),
    );
  }

  return {
    count: allTrends.length,
    category,
    trends: allTrends.sort(
      (firstItem, b) => (b.volume || 0) - (firstItem.volume || 0),
    ),
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
    .filter((tool) => tool.sources.size >= 2)
    .map((tool) => ({
      name: tool.name,
      normalizedName: tool.normalizedName,
      sourceCount: tool.sources.size,
      sources: Array.from(tool.sources),
      totalVolume: tool.totalVolume,
      entries: tool.entries,
    }))
    .sort(
      (agent, b) => b.sourceCount - agent.sourceCount || b.totalVolume - agent.totalVolume,
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
        (cachedTrend) =>
          cachedTrend.name.toLowerCase().includes(normalizedQuery) ||
          cachedTrend.normalizedName.includes(normalizedQuery),
      ),
    );
  }

  return {
    count: allTrends.length,
    query,
    trends: allTrends.sort(
      (firstItem, b) => (b.volume || 0) - (firstItem.volume || 0),
    ),
  };
}

/**
 * Returns health status for all collectors.
 */
export function getHealth() {
  const health: Record<
    string,
    {
      trendCount: number;
      lastFetch: string | null;
      error: TrendSourceData["error"];
    }
  > = {};
  for (const [source, data] of Object.entries(cache)) {
    health[source] = {
      trendCount: data.trends.length,
      lastFetch: data.lastFetch,
      error: data.error,
    };
  }
  return health;
}

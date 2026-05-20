import { TREND_SOURCES } from "../constants.ts";

// ─── In-Memory Cache ───────────────────────────────────────────────

const cache: Record<string, any> = {};

// Initialize cache slots for each source
for (const source of Object.values(TREND_SOURCES)) {
  cache[source] = {
    trends: [],
    lastFetch: null as any,
    error: null as any,
  };
}

// ─── Cache Update ──────────────────────────────────────────────────

/**
 * Updates the cache for a given source with fresh trend data.


 */
export function updateTrends(source: any, trends: any) {
  cache[source] = {
    trends,
    lastFetch: new Date().toISOString(),
    error: null as any,
  };
}

/**
 * Records an error for the given source.


 */
export function setTrendError(source: any, error: any) {
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
  const allTrends: any[] = [];
  const sourceSummary: Record<string, any> = {};

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
    trends: allTrends.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Returns cached trends from a specific source.

 */
export function getBySource(source: any) {
  const data = cache[source];
  if (!data) {
    return { count: 0, source, lastFetch: null as any, trends: [] };
  }
  return {
    count: data.trends.length,
    source,
    lastFetch: data.lastFetch,
    trends: data.trends.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Returns cached trends filtered by category.

 */
export function getByCategory(category: any) {
  const allTrends: any[] = [];
  for (const data of Object.values(cache)) {
    allTrends.push(
      ...data.trends.filter(
        (t: any) =>
          t.category && t.category.toLowerCase() === category.toLowerCase(),
      ),
    );
  }

  return {
    count: allTrends.length,
    category,
    trends: allTrends.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Finds cross-source correlated trends — topics appearing in 2+ sources.
 * Uses normalized name matching to find overlapping topics.
 */
export function getCorrelatedTrends() {
  // Build a map of normalizedName → { sources, totalVolume, entries }
  const topicMap = new Map();

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
      const topic = topicMap.get(key);
      topic.sources.add(trend.source);
      topic.totalVolume += trend.volume || 0;
      topic.entries.push(trend);
    }
  }

  // Filter to topics in 2+ sources
  const correlated = Array.from(topicMap.values())
    .filter((t: any) => t.sources.size >= 2)
    .map((t: any) => ({
      name: t.name,
      normalizedName: t.normalizedName,
      sourceCount: t.sources.size,
      sources: Array.from(t.sources),
      totalVolume: t.totalVolume,
      entries: t.entries,
    }))
    .sort(
      (a: any, b: any) => b.sourceCount - a.sourceCount || b.totalVolume - a.totalVolume,
    );

  return {
    count: correlated.length,
    trends: correlated,
  };
}

/**
 * Searches cached trends by keyword (case-insensitive).

 */
export function searchTrends(query: any) {
  const normalizedQuery = query.toLowerCase();
  const allTrends: any[] = [];

  for (const data of Object.values(cache)) {
    allTrends.push(
      ...data.trends.filter(
        (t: any) => t.name.toLowerCase().includes(normalizedQuery) || t.normalizedName.includes(normalizedQuery),
      ),
    );
  }

  return {
    count: allTrends.length,
    query,
    trends: allTrends.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0)),
  };
}

/**
 * Returns health status for all collectors.
 */
export function getHealth() {
  const health: Record<string, any> = {};
  for (const [source, data] of Object.entries(cache)) {
    health[source] = {
      trendCount: data.trends.length,
      lastFetch: data.lastFetch,
      error: data.error,
    };
  }
  return health;
}

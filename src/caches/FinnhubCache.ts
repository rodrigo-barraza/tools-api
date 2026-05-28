import {
  FINNHUB_QUOTE_TTL_MS,
  FINNHUB_PROFILE_TTL_MS,
  FINNHUB_RECOMMENDATION_TTL_MS,
  FINNHUB_FINANCIALS_TTL_MS,
} from "../constants.ts";

/**
 * In-memory cache for Finnhub finance data.
 *
 * All symbol-specific data (quotes, profiles, recommendations, financials)
 * is fetched on-demand and cached with a TTL. Only general data (market news,
 * earnings calendar) is polled on intervals.
 */

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache = {
  // ── On-demand data (TTL-based) ──
  quotes: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
  profiles: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
  recommendations: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
  financials: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }

  // ── Polled general data ──
  marketNews: [] as unknown[],
  newsLastFetch: null as Date | null,
  newsError: null as { message: string; time: string } | null,

  earnings: [] as unknown[],
  earningsLastFetch: null as Date | null,
  earningsError: null as { message: string; time: string } | null,
};

// ─── TTL Helper ────────────────────────────────────────────────────

function getCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  ttl: number,
): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttl) return null;
  return entry.data;
}

function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, data: T) {
  map.set(key, { data, fetchedAt: Date.now() });
}

// ─── Quote (on-demand) ─────────────────────────────────────────────

export function getCachedQuote(symbol: string) {
  return getCached(cache.quotes, symbol.toUpperCase(), FINNHUB_QUOTE_TTL_MS);
}

export function cacheQuote(symbol: string, data: unknown) {
  setCache(cache.quotes, symbol.toUpperCase(), data);
}

// ─── Profile (on-demand) ───────────────────────────────────────────

export function getCachedProfile(symbol: string) {
  return getCached(
    cache.profiles,
    symbol.toUpperCase(),
    FINNHUB_PROFILE_TTL_MS,
  );
}

export function cacheProfile(symbol: string, data: unknown) {
  setCache(cache.profiles, symbol.toUpperCase(), data);
}

// ─── Recommendation (on-demand) ────────────────────────────────────

export function getCachedRecommendation(symbol: string) {
  return getCached(
    cache.recommendations,
    symbol.toUpperCase(),
    FINNHUB_RECOMMENDATION_TTL_MS,
  );
}

export function cacheRecommendation(symbol: string, data: unknown) {
  setCache(cache.recommendations, symbol.toUpperCase(), data);
}

// ─── Financials (on-demand) ────────────────────────────────────────

export function getCachedFinancials(symbol: string) {
  return getCached(
    cache.financials,
    symbol.toUpperCase(),
    FINNHUB_FINANCIALS_TTL_MS,
  );
}

export function cacheFinancials(symbol: string, data: unknown) {
  setCache(cache.financials, symbol.toUpperCase(), data);
}

// ─── Market News (polled) ──────────────────────────────────────────

export function getMarketNews() {
  return cache.marketNews;
}

export function updateMarketNews(articles: unknown[]) {
  cache.marketNews = articles;
  cache.newsLastFetch = new Date();
  cache.newsError = null;
}

export function setNewsError(error: { message: string }) {
  cache.newsError = { message: error.message, time: new Date().toISOString() };
}

// ─── Earnings Calendar (polled) ────────────────────────────────────

export function getEarnings() {
  return cache.earnings;
}

export function updateEarnings(earningsData: unknown[]) {
  cache.earnings = earningsData;
  cache.earningsLastFetch = new Date();
  cache.earningsError = null;
}

export function setEarningsError(error: { message: string }) {
  cache.earningsError = {
    message: error.message,
    time: new Date().toISOString(),
  };
}

// ─── Health ────────────────────────────────────────────────────────

export function getFinanceHealth() {
  return {
    cachedQuotes: cache.quotes.size,
    cachedProfiles: cache.profiles.size,
    news: {
      lastFetch: cache.newsLastFetch,
      error: cache.newsError,
      articleCount: cache.marketNews.length,
    },
    earnings: {
      lastFetch: cache.earningsLastFetch,
      error: cache.earningsError,
      entryCount: cache.earnings.length,
    },
  };
}

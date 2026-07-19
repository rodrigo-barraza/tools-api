import { createSimpleCache } from "./createSimpleCache.ts";
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

// The on-demand maps stay hand-rolled: routes need the split
// "fresh-or-null get" + separate set API (to report `cached: true/false`)
// and health reports per-map entry counts — neither is expressible with
// the library's createTtlCache (peek ignores TTL; no size accessor).
const cache = {
  // ── On-demand data (TTL-based) ──
  quotes: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
  profiles: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
  recommendations: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
  financials: new Map<string, CacheEntry<unknown>>(), // symbol → { data, fetchedAt }
};

// ── Polled general data ──
const newsCache = createSimpleCache<unknown[]>({
  type: "array",
  itemsKey: "articles",
});
const earningsCache = createSimpleCache<unknown[]>({
  type: "array",
  itemsKey: "earnings",
});

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
  return newsCache.getData();
}

export function updateMarketNews(articles: unknown[]) {
  newsCache.update(articles);
}

export function setNewsError(error: { message: string }) {
  newsCache.setError(new Error(error.message));
}

// ─── Earnings Calendar (polled) ────────────────────────────────────

export function getEarnings() {
  return earningsCache.getData();
}

export function updateEarnings(earningsData: unknown[]) {
  earningsCache.update(earningsData);
}

export function setEarningsError(error: { message: string }) {
  earningsCache.setError(new Error(error.message));
}

// ─── Health ────────────────────────────────────────────────────────

export function getFinanceHealth() {
  const newsHealth = newsCache.getHealth();
  const earningsHealth = earningsCache.getHealth();
  return {
    cachedQuotes: cache.quotes.size,
    cachedProfiles: cache.profiles.size,
    news: {
      lastFetch: newsHealth.lastFetch,
      error: newsHealth.error,
      articleCount: newsHealth.count ?? 0,
    },
    earnings: {
      lastFetch: earningsHealth.lastFetch,
      error: earningsHealth.error,
      entryCount: earningsHealth.count ?? 0,
    },
  };
}

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

const cache = {
  // ── On-demand data (TTL-based) ──
  quotes: new Map(), // symbol → { data, fetchedAt }
  profiles: new Map(), // symbol → { data, fetchedAt }
  recommendations: new Map(), // symbol → { data, fetchedAt }
  financials: new Map(), // symbol → { data, fetchedAt }

  // ── Polled general data ──
  marketNews: [],
  newsLastFetch: null as any,
  newsError: null as any,

  earnings: [],
  earningsLastFetch: null as any,
  earningsError: null as any,
};

// ─── TTL Helper ────────────────────────────────────────────────────

function getCached(map: any, key: any, ttl: any) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttl) return null;
  return entry.data;
}

function setCache(map: any, key: any, data: any) {
  map.set(key, { data, fetchedAt: Date.now() });
}

// ─── Quote (on-demand) ─────────────────────────────────────────────

export function getCachedQuote(symbol: any) {
  return getCached(cache.quotes, symbol.toUpperCase(), FINNHUB_QUOTE_TTL_MS);
}

export function cacheQuote(symbol: any, data: any) {
  setCache(cache.quotes, symbol.toUpperCase(), data);
}

// ─── Profile (on-demand) ───────────────────────────────────────────

export function getCachedProfile(symbol: any) {
  return getCached(
    cache.profiles,
    symbol.toUpperCase(),
    FINNHUB_PROFILE_TTL_MS,
  );
}

export function cacheProfile(symbol: any, data: any) {
  setCache(cache.profiles, symbol.toUpperCase(), data);
}

// ─── Recommendation (on-demand) ────────────────────────────────────

export function getCachedRecommendation(symbol: any) {
  return getCached(
    cache.recommendations,
    symbol.toUpperCase(),
    FINNHUB_RECOMMENDATION_TTL_MS,
  );
}

export function cacheRecommendation(symbol: any, data: any) {
  setCache(cache.recommendations, symbol.toUpperCase(), data);
}

// ─── Financials (on-demand) ────────────────────────────────────────

export function getCachedFinancials(symbol: any) {
  return getCached(
    cache.financials,
    symbol.toUpperCase(),
    FINNHUB_FINANCIALS_TTL_MS,
  );
}

export function cacheFinancials(symbol: any, data: any) {
  setCache(cache.financials, symbol.toUpperCase(), data);
}

// ─── Market News (polled) ──────────────────────────────────────────

export function getMarketNews() {
  return cache.marketNews;
}

export function updateMarketNews(articles: any) {
  cache.marketNews = articles;
  cache.newsLastFetch = new Date();
  cache.newsError = null;
}

export function setNewsError(error: any) {
  cache.newsError = { message: error.message, time: new Date().toISOString() };
}

// ─── Earnings Calendar (polled) ────────────────────────────────────

export function getEarnings() {
  return cache.earnings;
}

export function updateEarnings(earningsData: any) {
  cache.earnings = earningsData;
  cache.earningsLastFetch = new Date();
  cache.earningsError = null;
}

export function setEarningsError(error: any) {
  cache.earningsError = { message: error.message, time: new Date().toISOString() };
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

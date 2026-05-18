import CONFIG from "../../config.ts";
import { FINNHUB_BASE_URL } from "../../constants.ts";

/**
 * Finnhub REST API fetcher.
 * All calls use the X-Finnhub-Token header for auth.
 * Sequential batch calls include a small delay to respect 60 calls/min rate limit.
 */

const HEADERS = () => ({
  "X-Finnhub-Token": CONFIG.FINNHUB_API_KEY,
});

// ─── Helpers ───────────────────────────────────────────────────────

async function get(path: any) {
  const url = `${FINNHUB_BASE_URL}${path}`;
  // @ts-expect-error - suppress remaining error
  const response = await fetch(url, { headers: HEADERS() });
  if (!response.ok) {
    throw new Error(`Finnhub ${path} → ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Rate limiting handled by RateLimiterService

// ─── Quote ─────────────────────────────────────────────────────────

/**
 * Fetch a real-time quote for a single symbol.
 * Returns { c, d, dp, h, l, o, pc, t } where:
 *   c  = current price
 *   d  = change
 *   dp = percent change
 *   h  = day high
 *   l  = day low
 *   o  = open
 *   pc = previous close
 *   t  = timestamp
 */
export async function fetchStockQuote(symbol: any) {
  return get(`/quote?symbol=${encodeURIComponent(symbol)}`);
}

// ─── Company Profile ───────────────────────────────────────────────

/**
 * Fetch company profile (name, logo, sector, market cap, etc.).
 */
export async function fetchCompanyProfile(symbol: any) {
  return get(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`);
}

// ─── News ──────────────────────────────────────────────────────────

/**
 * Fetch general market news.

 */
export async function fetchMarketNews(category: any = "general") {
  return get(`/news?category=${encodeURIComponent(category)}`);
}

/**
 * Fetch company-specific news.


 */
export async function fetchCompanyNews(symbol: any, from: any, to: any) {
  return get(
    `/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`,
  );
}

// ─── Earnings ──────────────────────────────────────────────────────

/**
 * Fetch earnings calendar.


 */
export async function fetchEarningsCalendar(from: any, to: any) {
  return get(`/calendar/earnings?from=${from}&to=${to}`);
}

// ─── Analyst Data ──────────────────────────────────────────────────

/**
 * Fetch analyst recommendation trends for a symbol.
 */
export async function fetchRecommendationTrends(symbol: any) {
  return get(`/stock/recommendation?symbol=${encodeURIComponent(symbol)}`);
}

/**
 * Fetch basic financial metrics (PE, EPS, 52w high/low, beta, etc.).
 */
export async function fetchBasicFinancials(symbol: any) {
  return get(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`);
}

import CONFIG from "../../config.ts";
import { FRED_BASE_URL, FRED_DEFAULT_SERIES } from "../../constants.ts";
import logger from "../../logger.ts";

/**
 * FRED (Federal Reserve Economic Data) API fetcher.
 * https://fred.stlouisfed.org/docs/api/fred/
 * Free API key required — 120 requests/min.
 *
 * Provides authoritative macroeconomic data including inflation,
 * interest rates, unemployment, GDP, and hundreds of thousands
 * of other economic time series.
 */

// ─── In-Memory Cache ───────────────────────────────────────────────

const seriesCache = new Map();
const SERIES_CACHE_TTL_MS = 3_600_000; // 1 hour — macro data updates infrequently

const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 1_800_000; // 30 minutes

// ─── Helpers ───────────────────────────────────────────────────────

function buildUrl(endpoint: any, params: Record<string, any> = {}) {
  const url = new URL(`${FRED_BASE_URL}/${endpoint}`);
  // @ts-expect-error - suppress remaining error
  url.searchParams.set("api_key", CONFIG.FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fredFetch(endpoint: any, params: Record<string, any> = {}) {
  if (!CONFIG.FRED_API_KEY) {
    throw new Error("FRED_API_KEY is not configured");
  }

  const url = buildUrl(endpoint, params);
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`FRED API → ${response.status} ${response.statusText}: ${body}`);
  }

  return response.json();
}

// ─── Series Info ───────────────────────────────────────────────────

/**
 * Get metadata for a FRED series.


 */
export async function getSeriesInfo(seriesId: any) {
  const data = await fredFetch("series", { series_id: seriesId });
  const series = data.seriess?.[0];
  if (!series) throw new Error(`Series "${seriesId}" not found`);

  return {
    id: series.id,
    title: series.title,
    frequency: series.frequency_short,
    units: series.units_short,
    seasonalAdjustment: series.seasonal_adjustment_short,
    lastUpdated: series.last_updated,
    observationStart: series.observation_start,
    observationEnd: series.observation_end,
    notes: series.notes || null,
  };
}

// ─── Series Observations ───────────────────────────────────────────

/**
 * Get observations (data points) for a FRED series.


 */
export async function getSeriesObservations(seriesId: any, options: Record<string, any> = {}) {
  const {
    limit = 50,
    sortOrder = "desc",
    observationStart,
    observationEnd,
  } = options;

  // Check cache
  const cacheKey = `${seriesId}:${limit}:${sortOrder}:${observationStart || ""}:${observationEnd || ""}`;
  const cached = seriesCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SERIES_CACHE_TTL_MS) {
    return cached.data;
  }

  const params: Record<string, any> = {
    series_id: seriesId,
    limit,
    sort_order: sortOrder,
  };
  if (observationStart) params.observation_start = observationStart;
  if (observationEnd) params.observation_end = observationEnd;

  const [seriesInfo, obsData] = await Promise.all([
    getSeriesInfo(seriesId),
    fredFetch("series/observations", params),
  ]);

  const observations = (obsData.observations || [])
    .filter((o: any) => o.value !== ".")
    .map((o: any) => ({
      date: o.date,
      value: parseFloat(o.value),
    }));

  const result = {
    series: seriesInfo,
    count: observations.length,
    observations,
    fetchedAt: new Date().toISOString(),
  };

  seriesCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Search Series ─────────────────────────────────────────────────

/**
 * Search for FRED series by keywords.


 */
export async function searchSeries(query: any, options: Record<string, any> = {}) {
  const { limit = 10, orderBy = "search_rank" } = options;

  const cacheKey = `search:${query}:${limit}:${orderBy}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await fredFetch("series/search", {
    search_text: query,
    limit,
    order_by: orderBy,
  });

  const series = (data.seriess || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    frequency: s.frequency_short,
    units: s.units_short,
    seasonalAdjustment: s.seasonal_adjustment_short,
    lastUpdated: s.last_updated,
    popularity: s.popularity,
    notes: s.notes ? s.notes.slice(0, 200) : null,
  }));

  const result = {
    query,
    count: series.length,
    totalResults: data.count || series.length,
    series,
  };

  searchCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Key Indicators (Curated Macro Snapshot) ───────────────────────

/**
 * Get the latest values for a curated set of key economic indicators.
 * Returns the most recent observation for each default series.

 */
export async function getKeyIndicators() {
  const cacheKey = "key-indicators";
  const cached = seriesCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SERIES_CACHE_TTL_MS) {
    return cached.data;
  }

  const entries = Object.entries(FRED_DEFAULT_SERIES);
  const results = await Promise.allSettled(
    entries.map(async ([seriesId, meta]: any) => {
      const data = await fredFetch("series/observations", {
        series_id: seriesId,
        limit: 1,
        sort_order: "desc",
      });

      const latest = data.observations?.find((o: any) => o.value !== ".");

      return {
        id: seriesId,
        name: meta.name,
        category: meta.category,
        value: latest ? parseFloat(latest.value) : null,
        date: latest?.date || null,
        unit: meta.unit,
      };
    }),
  );

  const indicators = results
    .filter((r: any) => r.status === "fulfilled")
    .map((r: any) => r.value);

  const failed = results
    .filter((r: any) => r.status === "rejected")
    .map((r: any, i: any) => ({ seriesId: entries[i][0], error: r.reason.message }));

  if (failed.length > 0) {
    logger.warn(
      `[FredFetcher] ⚠️ ${failed.length} indicator(s) failed:`,
      failed.map((f: any) => f.seriesId).join(", "),
    );
  }

  const result = {
    count: indicators.length,
    indicators,
    fetchedAt: new Date().toISOString(),
  };

  seriesCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

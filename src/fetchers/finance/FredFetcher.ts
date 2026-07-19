import { createTtlCache } from "@rodrigo-barraza/utilities-library/cache";
import CONFIG from "../../config.ts";
import { FRED_BASE_URL, FRED_DEFAULT_SERIES } from "../../constants.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

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

const seriesCache = createTtlCache();
const SERIES_CACHE_TTL_MS = 3_600_000; // 1 hour — macro data updates infrequently

const searchCache = createTtlCache();
const SEARCH_CACHE_TTL_MS = 1_800_000; // 30 minutes

// ─── Helpers ───────────────────────────────────────────────────────

function buildUrl(endpoint: string, params: Record<string, unknown> = {}) {
  const url = new URL(`${FRED_BASE_URL}/${endpoint}`);
  if (CONFIG.FRED_API_KEY) {
    url.searchParams.set("api_key", CONFIG.FRED_API_KEY);
  }
  url.searchParams.set("file_type", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fredFetch(
  endpoint: string,
  params: Record<string, unknown> = {},
) {
  if (!CONFIG.FRED_API_KEY) {
    throw new Error("FRED_API_KEY is not configured");
  }

  const url = buildUrl(endpoint, params);
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `FRED API → ${response.status} ${response.statusText}: ${body}`,
    );
  }

  return response.json();
}

// ─── Series Info ───────────────────────────────────────────────────

/**
 * Get metadata for a FRED series.


 */
export async function getSeriesInfo(seriesId: string) {
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

export interface FredObservationOptions {
  limit?: number;
  sortOrder?: string;
  observationStart?: string;
  observationEnd?: string;
}

/**
 * Get observations (data points) for a FRED series.


 */
export async function getSeriesObservations(
  seriesId: string,
  options: FredObservationOptions = {},
) {
  const {
    limit = 50,
    sortOrder = "desc",
    observationStart,
    observationEnd,
  } = options;

  const cacheKey = `${seriesId}:${limit}:${sortOrder}:${observationStart || ""}:${observationEnd || ""}`;
  return seriesCache.get(cacheKey, SERIES_CACHE_TTL_MS, async () => {
    const params: Record<string, unknown> = {
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
      .filter((observation: Record<string, string>) => observation.value !== ".")
      .map((observation: Record<string, string>) => ({
        date: observation.date,
        value: parseFloat(observation.value),
      }));

    return {
      series: seriesInfo,
      count: observations.length,
      observations,
      fetchedAt: new Date().toISOString(),
    };
  });
}

// ─── Search Series ─────────────────────────────────────────────────

export interface FredSearchOptions {
  limit?: number;
  orderBy?: string;
}

/**
 * Search for FRED series by keywords.


 */
export async function searchSeries(
  query: string,
  options: FredSearchOptions = {},
) {
  const { limit = 10, orderBy = "search_rank" } = options;

  const cacheKey = `search:${query}:${limit}:${orderBy}`;
  return searchCache.get(cacheKey, SEARCH_CACHE_TTL_MS, async () => {
    const data = await fredFetch("series/search", {
      search_text: query,
      limit,
      order_by: orderBy,
    });

    interface FredSeriesResult {
      id: string;
      title: string;
      frequency_short?: string;
      units_short?: string;
      seasonal_adjustment_short?: string;
      last_updated?: string;
      popularity?: number;
      notes?: string;
    }

    const series = (data.seriess || []).map((seriesItem: FredSeriesResult) => ({
      id: seriesItem.id,
      title: seriesItem.title,
      frequency: seriesItem.frequency_short,
      units: seriesItem.units_short,
      seasonalAdjustment: seriesItem.seasonal_adjustment_short,
      lastUpdated: seriesItem.last_updated,
      popularity: seriesItem.popularity,
      notes: seriesItem.notes ? seriesItem.notes.slice(0, 200) : null,
    }));

    return {
      query,
      count: series.length,
      totalResults: data.count || series.length,
      series,
    };
  });
}

// ─── Key Indicators (Curated Macro Snapshot) ───────────────────────

interface FredIndicator {
  id: string;
  name: string;
  category: string;
  value: number | null;
  date: string | null;
  unit: string;
}

/**
 * Get the latest values for a curated set of key economic indicators.
 * Returns the most recent observation for each default series.

 */
export async function getKeyIndicators() {
  return seriesCache.get("key-indicators", SERIES_CACHE_TTL_MS, fetchKeyIndicators);
}

async function fetchKeyIndicators() {
  const entries = Object.entries(FRED_DEFAULT_SERIES);
  const results = await Promise.allSettled(
    entries.map(async ([seriesId, meta]) => {
      const data = await fredFetch("series/observations", {
        series_id: seriesId,
        limit: 1,
        sort_order: "desc",
      });

      const latest = data.observations?.find(
        (observation: Record<string, string>) => observation.value !== ".",
      );

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
    .filter(
      (resultItem): resultItem is PromiseFulfilledResult<FredIndicator> =>
        resultItem.status === "fulfilled",
    )
    .map((resultItem) => resultItem.value);

  const failed = results
    .filter((resultItem): resultItem is PromiseRejectedResult => resultItem.status === "rejected")
    .map((resultItem, index) => ({
      seriesId: entries[index][0],
      error: errorMessage(resultItem.reason),
    }));

  if (failed.length > 0) {
    logger.warn(
      `[FredFetcher] ⚠️ ${failed.length} indicator(s) failed:`,
      failed.map((failedItem) => failedItem.seriesId).join(", "),
    );
  }

  return {
    count: indicators.length,
    indicators,
    fetchedAt: new Date().toISOString(),
  };
}

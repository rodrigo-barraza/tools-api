import { createTtlCache } from "@rodrigo-barraza/utilities-library/cache";
import CONFIG from "../../config.ts";
import { EIA_BASE_URL, EIA_DEFAULT_SERIES } from "../../constants.ts";
import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

/**
 * EIA (U.S. Energy Information Administration) APIv2 Fetcher.
 * https://www.eia.gov/opendata/documentation.php
 *
 * Provides authoritative U.S. energy data: petroleum prices, electricity
 * generation, natural gas storage, coal production, renewable capacity,
 * nuclear outages, and more.
 *
 * Requires: Free API key — register at https://www.eia.gov/opendata/
 * Rate limits: Undocumented per-second limit; keys auto-suspended if exceeded.
 *              Using conservative 500ms pacing between requests.
 * Max rows: 5,000 per request (use offset for pagination).
 */

// ─── In-Memory Cache ───────────────────────────────────────────────

const dataCache = createTtlCache();
const DATA_CACHE_TTL_MS = 3_600_000; // 1 hour — energy data updates infrequently

const metaCache = createTtlCache();
const META_CACHE_TTL_MS = 86_400_000; // 24 hours — routes/metadata rarely change

// ─── Helpers ───────────────────────────────────────────────────────

function buildUrl(route: string, params: Record<string, unknown> = {}) {
  const url = new URL(`${EIA_BASE_URL}/${route}`);
  if (CONFIG.EIA_API_KEY) {
    url.searchParams.set("api_key", CONFIG.EIA_API_KEY);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      if (Array.isArray(value)) {
        value.forEach((itemValue: unknown) =>
          url.searchParams.append(`${key}[]`, String(itemValue)),
        );
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function eiaFetch(route: string, params: Record<string, unknown> = {}) {
  if (!CONFIG.EIA_API_KEY) {
    throw new Error("EIA_API_KEY is not configured");
  }

  await rateLimiter.wait("EIA");

  const url = buildUrl(route, params);
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `EIA API → ${response.status} ${response.statusText}: ${body}`,
    );
  }

  const json = await response.json();

  // EIA returns errors inside the response body
  if (json.error) {
    throw new Error(`EIA API error: ${json.error}`);
  }

  return json;
}

// ─── Route Discovery / Metadata ────────────────────────────────────

/**
 * Browse the EIA data tree at a given route path.
 * Returns child routes, available facets, frequencies, and data columns.
 */
export async function browseRoute(route: string = "") {
  return metaCache.get(`meta:${route}`, META_CACHE_TTL_MS, async () => {
    const path = route ? `v2/${route}` : "v2";
    const json = await eiaFetch(path);
    const resp = json.response || json;

    return {
      id: resp.id,
      name: resp.name,
      description: resp.description || null,
      routes: (resp.routes || []).map(
        (routeItem: { id?: string; name?: string; description?: string }) => ({
          id: routeItem.id,
          name: routeItem.name,
          description: routeItem.description || null,
        }),
      ),
      frequency: resp.frequency || [],
      facets: resp.facets || [],
      data: resp.data || null, // available data columns
      startPeriod: resp.startPeriod || null,
      endPeriod: resp.endPeriod || null,
    };
  });
}

/**
 * Get available facet values for a route + facet.
 */
export async function getFacetValues(route: string, facetId: string) {
  return metaCache.get(`facet:${route}:${facetId}`, META_CACHE_TTL_MS, async () => {
    const json = await eiaFetch(`v2/${route}/facet/${facetId}`);
    const resp = json.response || json;

    return {
      route,
      facetId,
      totalFacets: resp.totalFacets || 0,
      facets: (resp.facets || []).map(
        (facet: { id?: string; name?: string; alias?: string }) => ({
          id: facet.id,
          name: facet.name,
          alias: facet.alias || null,
        }),
      ),
    };
  });
}

// ─── Data Retrieval ────────────────────────────────────────────────

export interface EiaGetDataOptions {
  data?: string[];
  facets?: Record<string, string | string[]>;
  frequency?: string;
  start?: string;
  end?: string;
  sort?: string;
  length?: number;
  offset?: number;
}

/**
 * Fetch data from the EIA API for a given route.
 */
export async function getData(route: string, options: EiaGetDataOptions = {}) {
  const {
    data: dataColumns,
    facets,
    frequency,
    start,
    end,
    sort,
    length = 100,
    offset = 0,
  } = options;

  // Build cache key from all parameters
  const cacheKey = `data:${route}:${JSON.stringify(options)}`;
  return dataCache.get(cacheKey, DATA_CACHE_TTL_MS, async () => {
    // Build query params
    const params: Record<string, unknown> = {
      length: Math.min(length, 5000),
      offset,
    };

    if (frequency) params.frequency = frequency;
    if (start) params.start = start;
    if (end) params.end = end;
    if (sort) {
      const [collection, dir] = sort.split(":");
      params["sort[0][column]"] = collection;
      params["sort[0][direction]"] = dir || "desc";
    }

    // Build the URL manually for array params (data[] and facets[][])
    let url = buildUrl(`v2/${route}/data`, params);

    // Append data columns
    if (dataColumns?.length) {
      const dataParams = dataColumns
        .map((dataColumn: string) => `data[]=${encodeURIComponent(dataColumn)}`)
        .join("&");
      url += `&${dataParams}`;
    }

    // Append facets
    if (facets) {
      for (const [facetId, values] of Object.entries(facets)) {
        const facetParams = (Array.isArray(values) ? values : [values])
          .map(
            (facetValue: string) =>
              `facets[${encodeURIComponent(facetId)}][]=${encodeURIComponent(facetValue)}`,
          )
          .join("&");
        url += `&${facetParams}`;
      }
    }

    // Direct fetch since we've manually built the URL
    await rateLimiter.wait("EIA");
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `EIA API → ${response.status} ${response.statusText}: ${body}`,
      );
    }

    const json = await response.json();
    if (json.error) throw new Error(`EIA API error: ${json.error}`);

    const resp = json.response || json;

    return {
      route,
      total: parseInt(resp.total, 10) || 0,
      dateFormat: resp.dateFormat || null,
      frequency: resp.frequency || null,
      count: (resp.data || []).length,
      data: resp.data || [],
      warning: resp.warning || null,
      fetchedAt: new Date().toISOString(),
    };
  });
}

// ─── Curated Energy Snapshots ──────────────────────────────────────

interface EiaIndicator {
  id: string;
  name: string;
  category: string;
  value: unknown;
  period: string | null;
  unit: string;
  description: string | null;
}

/**
 * Get the latest values for a curated set of key energy indicators.
 * Fetches the most recent data point for each series in EIA_DEFAULT_SERIES.
 */
export async function getEnergyIndicators() {
  return dataCache.get("energy-indicators", DATA_CACHE_TTL_MS, fetchEnergyIndicators);
}

async function fetchEnergyIndicators() {
  const entries = Object.entries(EIA_DEFAULT_SERIES);
  const results = await Promise.allSettled(
    entries.map(async ([key, meta]) => {
      const seriesData = await getData(meta.route, {
        data: [meta.dataColumn],
        facets: "facets" in meta ? meta.facets : undefined,
        frequency: meta.frequency || undefined,
        length: 1,
        sort: "period:desc",
      });

      const latest = seriesData.data?.[0];

      return {
        id: key,
        name: meta.name,
        category: meta.category,
        value: latest ? latest[meta.dataColumn] : null,
        period: latest?.period || null,
        unit: meta.unit,
        description: meta.description || null,
      };
    }),
  );

  const indicators = results
    .filter(
      (resultItem): resultItem is PromiseFulfilledResult<EiaIndicator> =>
        resultItem.status === "fulfilled",
    )
    .map((resultItem) => resultItem.value);

  const failed = results
    .filter((resultItem): resultItem is PromiseRejectedResult => resultItem.status === "rejected")
    .map((resultItem, index) => ({
      series: entries[index][0],
      error: errorMessage(resultItem.reason),
    }));

  if (failed.length > 0) {
    logger.warn(
      `[EiaFetcher] ⚠️ ${failed.length} indicator(s) failed:`,
      failed.map((failedItem) => failedItem.series).join(", "),
    );
  }

  return {
    count: indicators.length,
    indicators,
    fetchedAt: new Date().toISOString(),
  };
}

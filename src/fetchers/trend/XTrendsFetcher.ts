import { normalizeName } from "@rodrigo-barraza/utilities-library";
import CONFIG from "../../config.ts";
import { TREND_SOURCES as SOURCES, X_WOEIDS } from "../../constants.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

/**
 * Fetches trending topics from X (Twitter) for a given WOEID.
 * Uses X API v1.1 trends/place endpoint (available on free tier, 100 reads/month).
 * Called once per day to stay within free tier limits.
 */
export async function fetchXTrends(woeid: any = X_WOEIDS.WORLDWIDE) {
  if (!CONFIG.X_BEARER_TOKEN) {
    throw new Error("X_BEARER_TOKEN not configured");
  }

  const url = `https://api.x.com/1.1/trends/place.json?id=${woeid}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CONFIG.X_BEARER_TOKEN}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`X API returned ${response.status}: ${body}`);
  }

  const data = await response.json();
  const trendData = data?.[0];
  if (!trendData) {
    throw new Error("X API returned empty response");
  }

  const location = trendData.locations?.[0]?.name || "Unknown";
  const asOf = trendData.as_of || new Date().toISOString();

  return (trendData.trends || []).map((trend: any) => ({
    name: trend.name,
    normalizedName: normalizeName(trend.name.replace(/^#/, "")),
    source: SOURCES.X,
    volume: trend.tweet_volume || 0,
    url:
      trend.url || `https://x.com/search?q=${encodeURIComponent(trend.name)}`,
    context: {
      location,
      woeid,
      asOf,
      promotedContent: trend.promoted_content || null,
    },
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Fetches trends from multiple locations and deduplicates.
 * Uses 1 API call per location — keep locations minimal on free tier.
 */
export async function fetchAllXTrends() {
  if (!CONFIG.X_BEARER_TOKEN) {
    throw new Error("X_BEARER_TOKEN not configured");
  }

  // On free tier (100/month), just fetch worldwide to conserve reads
  const allTrends: any[] = [];

  try {
    const trends = await fetchXTrends(X_WOEIDS.WORLDWIDE);
    allTrends.push(...trends);
  } catch (error: unknown) {
    logger.error(`[X] ❌ Worldwide: ${errorMessage(error)}`);
  }

  return allTrends;
}

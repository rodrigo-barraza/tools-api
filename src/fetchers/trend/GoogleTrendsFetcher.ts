import {
  TREND_SOURCES as SOURCES,
  GOOGLE_TRENDS_GEOS,
} from "../../constants.ts";
import { extractXmlTag, randomUserAgent, errorMessage } from "../../utilities.ts";
import logger from "../../logger.ts";

const TRENDS_RSS_URL = "https://trends.google.com/trending/rss";

/**
 * Fetches daily trending searches from Google Trends via RSS feed.
 * More stable than the unofficial npm package — RSS feeds rarely get blocked.

 */
interface GoogleTrendItem {
  name: string;
  normalizedName: string;
  source: string;
  volume: number;
  url: string;
  context: {
    geo: string;
    traffic: string | null;
    article: { title: string; url: string | null; source: string | null } | null;
    pubDate: string | null;
  };
  timestamp: string;
}

export async function fetchGoogleDailyTrends(geo: string = "US") {
  const url = `${TRENDS_RSS_URL}?geo=${geo}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": randomUserAgent(),
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Trends RSS returned ${response.status}`);
  }

  const xml = await response.text();
  return parseRssTrends(xml, geo);
}

/**
 * Parses the Google Trends RSS XML into normalized trend objects.
 * Uses regex-based parsing to avoid needing an XML library.


 */
function parseRssTrends(xml: string, geo: string) {
  const trends: GoogleTrendItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const title = extractXmlTag(item, "title");
    if (!title) continue;

    const traffic = extractXmlTag(item, "ht:approx_traffic");
    const newsUrl = extractXmlTag(item, "ht:news_item_url");
    const newsTitle = extractXmlTag(item, "ht:news_item_title");
    const newsSource = extractXmlTag(item, "ht:news_item_source");
    const pubDate = extractXmlTag(item, "pubDate");

    const volume = traffic ? parseInt(traffic.replace(/[^0-9]/g, "")) || 0 : 0;

    trends.push({
      name: title,
      normalizedName: title.toLowerCase().trim(),
      source: SOURCES.GOOGLE_TRENDS,
      volume,
      url: `https://trends.google.com/trending?geo=${geo}&q=${encodeURIComponent(title)}`,
      context: {
        geo,
        traffic,
        article: newsTitle
          ? { title: newsTitle, url: newsUrl, source: newsSource }
          : null,
        pubDate: pubDate || null,
      },
      timestamp: new Date().toISOString(),
    });
  }

  return trends;
}

/**
 * Fetches daily trends from multiple geos and deduplicates.
 */
export async function fetchGoogleTrends() {
  const allTrends: GoogleTrendItem[] = [];

  for (const geo of GOOGLE_TRENDS_GEOS) {
    try {
      const trends = await fetchGoogleDailyTrends(geo);
      allTrends.push(...trends);
    } catch (error: unknown) {
      logger.error(`[Google Trends] ❌ ${geo}: ${errorMessage(error)}`);
    }
  }

  // Deduplicate by normalizedName, keeping the one with higher volume
  const seen = new Map();
  for (const trend of allTrends) {
    const existing = seen.get(trend.normalizedName);
    if (!existing || trend.volume > existing.volume) {
      seen.set(trend.normalizedName, trend);
    }
  }

  return Array.from(seen.values());
}

import { TREND_SOURCES as SOURCES } from "../../constants.js";

const TRENDS_RSS_URL = "https://trends.google.com/trending/rss";

/**
 * Fetches daily trending searches from Google Trends via RSS feed.
 * More stable than the unofficial npm package — RSS feeds rarely get blocked.
 * @param {string} geo - Country code (e.g. "US", "CA")
 * @returns {Promise<Array>} Normalized trend objects
 */
export async function fetchGoogleDailyTrends(geo = "US") {
  const url = `${TRENDS_RSS_URL}?geo=${geo}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!res.ok) {
    throw new Error(`Google Trends RSS returned ${res.status}`);
  }

  const xml = await res.text();
  return parseRssTrends(xml, geo);
}

/**
 * Parses the Google Trends RSS XML into normalized trend objects.
 * Uses regex-based parsing to avoid needing an XML library.
 * @param {string} xml - Raw RSS XML string
 * @param {string} geo - Country code
 * @returns {Array} Normalized trend objects
 */
function parseRssTrends(xml, geo) {
  const trends = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const title = extractTag(item, "title");
    if (!title) continue;

    const traffic = extractTag(item, "ht:approx_traffic");
    const newsUrl = extractTag(item, "ht:news_item_url");
    const newsTitle = extractTag(item, "ht:news_item_title");
    const newsSource = extractTag(item, "ht:news_item_source");
    const pubDate = extractTag(item, "pubDate");

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
 * Extracts the text content of an XML tag.
 * @param {string} xml - XML string to search
 * @param {string} tag - Tag name (supports namespaced tags like ht:approx_traffic)
 * @returns {string|null} Tag content or null
 */
function extractTag(xml, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<${escapedTag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escapedTag}>|<${escapedTag}>([\\s\\S]*?)<\\/${escapedTag}>`,
  );
  const match = xml.match(regex);
  if (!match) return null;
  return (match[1] || match[2] || "").trim();
}

/**
 * Fetches daily trends from multiple geos and deduplicates.
 * @returns {Promise<Array>} Combined normalized trend objects
 */
export async function fetchGoogleTrends() {
  const geos = ["US", "CA", "GB", "AU", "IN", "DE", "JP", "FR", "BR"];
  const allTrends = [];

  for (const geo of geos) {
    try {
      const trends = await fetchGoogleDailyTrends(geo);
      allTrends.push(...trends);
    } catch (error) {
      console.error(`[Google Trends] ❌ ${geo}: ${error.message}`);
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

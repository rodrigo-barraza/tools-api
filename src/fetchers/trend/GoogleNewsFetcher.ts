import { normalizeName } from "@rodrigo-barraza/utilities-library";
import {
  TREND_SOURCES as SOURCES,
  GOOGLE_NEWS_ARTICLE_LIMIT,
  USER_AGENT,
} from "../../constants.ts";
import logger from "../../logger.ts";
import {
  extractXmlTag,
  extractXmlItems,
  errorMessage,
} from "../../utilities.ts";

const GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss";

/**
 * Categorize a Google News article based on its source tag or section.

 */
function categorizeArticle(section: string | null) {
  if (!section) return "general";

  const lower = section.toLowerCase();
  if (lower.includes("tech")) return "technology";
  if (lower.includes("sport")) return "sports";
  if (lower.includes("entertain")) return "entertainment";
  if (lower.includes("business") || lower.includes("economy")) {
    return "business";
  }
  if (lower.includes("science") || lower.includes("health")) return "science";
  if (lower.includes("world") || lower.includes("nation")) return "world";
  return "general";
}

/**
 * Fetches the top stories from Google News via their public RSS feed.
 * No API key required — returns up to ~100 headlines.
 * Feed sections: top headlines, world, nation, business, technology,
 * entertainment, sports, science, health.
 */
export async function fetchGoogleNews() {
  const sections = [
    { url: GOOGLE_NEWS_RSS_URL, section: "Top Stories" },
    {
      url: `${GOOGLE_NEWS_RSS_URL}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB`,
      section: "Technology",
    },
    {
      url: `${GOOGLE_NEWS_RSS_URL}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB`,
      section: "Science",
    },
    {
      url: `${GOOGLE_NEWS_RSS_URL}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB`,
      section: "Entertainment",
    },
    {
      url: `${GOOGLE_NEWS_RSS_URL}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB`,
      section: "Business",
    },
  ];

  const allArticles: Array<{
    title: string;
    link: string | null;
    pubDate: string | null;
    source: string | null;
    section: string;
  }> = [];
  const seen = new Set();

  for (const { url, section } of sections) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        logger.warn(`[Google News] ⚠️ ${section} returned ${response.status}`);
        continue;
      }

      const xml = await response.text();
      const items = extractXmlItems(xml, "item");

      for (const item of items) {
        const title = extractXmlTag(item, "title");
        const link = extractXmlTag(item, "link");
        const pubDate = extractXmlTag(item, "pubDate");
        const source = extractXmlTag(item, "source");

        if (!title || seen.has(title)) continue;
        seen.add(title);

        allArticles.push({
          title,
          link,
          pubDate,
          source,
          section,
        });
      }
    } catch (error: unknown) {
      logger.warn(
        `[Google News] ⚠️ ${section} fetch failed: ${errorMessage(error)}`,
      );
    }
  }

  return allArticles
    .slice(0, GOOGLE_NEWS_ARTICLE_LIMIT)
    .map((article, index) => ({
      name: article.title,
      normalizedName: normalizeName(article.title),
      source: SOURCES.GOOGLE_NEWS,
      volume: GOOGLE_NEWS_ARTICLE_LIMIT - index,
      url: article.link,
      context: {
        rank: index + 1,
        section: article.section,
        publisher: article.source || null,
        publishedAt: article.pubDate
          ? new Date(article.pubDate).toISOString()
          : null,
      },
      category: categorizeArticle(article.section),
      timestamp: new Date().toISOString(),
    }));
}

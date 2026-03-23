import {
  TREND_SOURCES as SOURCES,
  GOOGLE_NEWS_ARTICLE_LIMIT,
} from "../../constants.js";

const GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss";

/**
 * Lightweight XML text extractor — pulls the text content between
 * an opening and closing tag. Not a full parser, but sufficient for
 * well-formed RSS feeds.
 * @param {string} xml - Raw XML string
 * @param {string} tag - Tag name to extract
 * @returns {string|null} Text content or null
 */
function extractTag(xml, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;

  const start = xml.indexOf(open);
  if (start === -1) return null;

  const end = xml.indexOf(close, start);
  if (end === -1) return null;

  let content = xml.slice(start + open.length, end).trim();

  // Strip CDATA wrapper if present
  if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) {
    content = content.slice(9, -3);
  }

  return content;
}

/**
 * Extracts all occurrences of <item> blocks from RSS XML.
 * @param {string} xml - Full RSS XML body
 * @returns {string[]} Array of raw <item>…</item> blocks
 */
function extractItems(xml) {
  const items = [];
  let cursor = 0;

  while (true) {
    const start = xml.indexOf("<item>", cursor);
    if (start === -1) break;
    const end = xml.indexOf("</item>", start);
    if (end === -1) break;
    items.push(xml.slice(start, end + 7));
    cursor = end + 7;
  }

  return items;
}

/**
 * Categorize a Google News article based on its source tag or section.
 * @param {string} section - RSS topic/section if present
 * @returns {string} Category string
 */
function categorizeArticle(section) {
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
 * @returns {Promise<Array>} Normalized trend objects
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

  const allArticles = [];
  const seen = new Set();

  for (const { url, section } of sections) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "sun:trends:v0.1.0 (rodrigo@sun.dev)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });

      if (!res.ok) {
        console.warn(`[Google News] ⚠️ ${section} returned ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const items = extractItems(xml);

      for (const item of items) {
        const title = extractTag(item, "title");
        const link = extractTag(item, "link");
        const pubDate = extractTag(item, "pubDate");
        const source = extractTag(item, "source");

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
    } catch (error) {
      console.warn(
        `[Google News] ⚠️ ${section} fetch failed: ${error.message}`,
      );
    }
  }

  return allArticles
    .slice(0, GOOGLE_NEWS_ARTICLE_LIMIT)
    .map((article, index) => ({
      name: article.title,
      normalizedName: article.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, " "),
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

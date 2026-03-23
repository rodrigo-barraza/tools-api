import {
  TREND_SOURCES as SOURCES,
  WIKIPEDIA_EXCLUDED_PAGES,
  WIKIPEDIA_TOP_ARTICLES_LIMIT,
} from "../../constants.js";

/**
 * Fetches the most-viewed Wikipedia articles for a given date.
 * Uses the Wikimedia REST API (completely free, no auth required).
 * @param {Date} date - The date to fetch (defaults to yesterday)
 * @returns {Promise<Array>} Normalized trend objects
 */
export async function fetchWikipediaTrends(date = null) {
  // Use yesterday's date since today's data isn't available until after midnight UTC
  const d = date || new Date(Date.now() - 86_400_000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${month}/${day}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "sun:trends:v0.1.0 (rodrigo@sun.dev)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Wikipedia API returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const articles = data?.items?.[0]?.articles || [];

  return articles
    .filter((a) => !WIKIPEDIA_EXCLUDED_PAGES.includes(a.article))
    .slice(0, WIKIPEDIA_TOP_ARTICLES_LIMIT)
    .map((article) => {
      const name = article.article.replace(/_/g, " ");
      return {
        name,
        normalizedName: name.toLowerCase().trim(),
        source: SOURCES.WIKIPEDIA,
        volume: article.views || 0,
        url: `https://en.wikipedia.org/wiki/${article.article}`,
        context: {
          rank: article.rank,
          date: `${year}-${month}-${day}`,
          views: article.views,
        },
        timestamp: new Date().toISOString(),
      };
    });
}

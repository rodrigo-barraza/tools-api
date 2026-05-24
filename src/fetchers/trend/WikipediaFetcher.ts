import {
  TREND_SOURCES as SOURCES,
  USER_AGENT,
  WIKIPEDIA_EXCLUDED_PAGES,
  WIKIPEDIA_TOP_ARTICLES_LIMIT,
} from "../../constants.ts";

interface WikiArticle {
  article: string;
  views: number;
  rank: number;
}

/**
 * Fetches the most-viewed Wikipedia articles for a given date.
 * Uses the Wikimedia REST API (completely free, no auth required).

 */
export async function fetchWikipediaTrends(date: Date | string | null = null) {
  // Use yesterday's date since today's data isn't available until after midnight UTC
  const targetDate: Date = date instanceof Date ? date : date ? new Date(date) : new Date(Date.now() - 86_400_000);
  const year = targetDate.getUTCFullYear();
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getUTCDate()).padStart(2, "0");

  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${month}/${day}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const articles = data?.items?.[0]?.articles || [];

  return (articles as WikiArticle[])
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

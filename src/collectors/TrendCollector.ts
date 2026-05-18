import {
  TREND_SOURCES,
  GOOGLE_TRENDS_INTERVAL_MS,
  REDDIT_INTERVAL_MS,
  WIKIPEDIA_INTERVAL_MS,
  HACKERNEWS_INTERVAL_MS,
  X_TRENDS_INTERVAL_MS,
  GOOGLE_NEWS_INTERVAL_MS,
  MASTODON_INTERVAL_MS,
  TVMAZE_INTERVAL_MS,
  BLUESKY_INTERVAL_MS,
  GITHUB_TRENDING_INTERVAL_MS,
  PRODUCTHUNT_TREND_INTERVAL_MS,
} from "../constants.ts";
import { upsertTrends } from "../models/Trend.ts";
import { fetchGoogleTrends } from "../fetchers/trend/GoogleTrendsFetcher.ts";
import { fetchRedditTrends } from "../fetchers/trend/RedditFetcher.ts";
import { fetchWikipediaTrends } from "../fetchers/trend/WikipediaFetcher.ts";
import { fetchHackerNewsTrends } from "../fetchers/trend/HackerNewsFetcher.ts";
import { fetchAllXTrends } from "../fetchers/trend/XTrendsFetcher.ts";
import { fetchGoogleNews } from "../fetchers/trend/GoogleNewsFetcher.ts";
import { fetchMastodonTrends } from "../fetchers/trend/MastodonFetcher.ts";
import { fetchTVMazeTrends } from "../fetchers/trend/TVMazeFetcher.ts";
import { fetchBlueskyTrends } from "../fetchers/trend/BlueskyFetcher.ts";
import { fetchGitHubTrending } from "../fetchers/trend/GitHubTrendingFetcher.ts";
import { fetchProductHuntTrends } from "../fetchers/trend/ProductHuntFetcher.ts";
import { updateTrends, setTrendError } from "../caches/TrendCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import logger from "../logger.ts";

// ─── Collector Factory ─────────────────────────────────────────────

function createTrendCollector(collection: any, source: any, fetchFn: any, noun: any = "trends") {
  return async function () {
    try {
      const trends = await fetchFn();
      updateTrends(source, trends);
      const result = await upsertTrends(trends);
      await saveState(collection, { source, trends });
      logger.info(
        `[${collection}] ✅ ${trends.length} ${noun} | ${result.upserted} new, ${result.modified} updated`,
      );
    } catch (error: any) {
      setTrendError(source, error);
      logger.error(`[${collection}] ❌ ${error.message}`);
    }
  };
}

// ─── Collectors ────────────────────────────────────────────────────

const collectGoogleTrends = createTrendCollector("trends_google", TREND_SOURCES.GOOGLE_TRENDS, fetchGoogleTrends);
const collectWikipedia = createTrendCollector("trends_wikipedia", TREND_SOURCES.WIKIPEDIA, fetchWikipediaTrends, "articles");
const collectHackerNews = createTrendCollector("trends_hackernews", TREND_SOURCES.HACKERNEWS, fetchHackerNewsTrends, "stories");
const collectReddit = createTrendCollector("trends_reddit", TREND_SOURCES.REDDIT, fetchRedditTrends);
const collectXTrends = createTrendCollector("trends_x", TREND_SOURCES.X, fetchAllXTrends, "trending topics");
const collectGoogleNews = createTrendCollector("trends_google_news", TREND_SOURCES.GOOGLE_NEWS, fetchGoogleNews, "articles");
const collectMastodon = createTrendCollector("trends_mastodon", TREND_SOURCES.MASTODON, fetchMastodonTrends, "trending items");
const collectTVMaze = createTrendCollector("trends_tvmaze", TREND_SOURCES.TVMAZE, fetchTVMazeTrends, "shows");
const collectBluesky = createTrendCollector("trends_bluesky", TREND_SOURCES.BLUESKY, fetchBlueskyTrends, "trending items");
const collectGitHubTrending = createTrendCollector("trends_github", TREND_SOURCES.GITHUB, fetchGitHubTrending, "repos");
const collectProductHunt = createTrendCollector("trends_producthunt", TREND_SOURCES.PRODUCTHUNT, fetchProductHuntTrends, "products");

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  { label: "Google Trends", collection: "trends_google", ttl: GOOGLE_TRENDS_INTERVAL_MS, collectFn: collectGoogleTrends, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 0 },
  { label: "Wikipedia", collection: "trends_wikipedia", ttl: WIKIPEDIA_INTERVAL_MS, collectFn: collectWikipedia, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 3_000 },
  { label: "Hacker News", collection: "trends_hackernews", ttl: HACKERNEWS_INTERVAL_MS, collectFn: collectHackerNews, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 6_000 },
  { label: "Reddit", collection: "trends_reddit", ttl: REDDIT_INTERVAL_MS, collectFn: collectReddit, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 9_000 },
  { label: "X", collection: "trends_x", ttl: X_TRENDS_INTERVAL_MS, collectFn: collectXTrends, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 12_000 },
  { label: "Google News", collection: "trends_google_news", ttl: GOOGLE_NEWS_INTERVAL_MS, collectFn: collectGoogleNews, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 15_000 },
  { label: "Mastodon", collection: "trends_mastodon", ttl: MASTODON_INTERVAL_MS, collectFn: collectMastodon, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 18_000 },
  { label: "TVMaze", collection: "trends_tvmaze", ttl: TVMAZE_INTERVAL_MS, collectFn: collectTVMaze, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 21_000 },
  { label: "Bluesky", collection: "trends_bluesky", ttl: BLUESKY_INTERVAL_MS, collectFn: collectBluesky, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 24_000 },
  { label: "GitHub Trending", collection: "trends_github", ttl: GITHUB_TRENDING_INTERVAL_MS, collectFn: collectGitHubTrending, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 27_000 },
  { label: "Product Hunt", collection: "trends_producthunt", ttl: PRODUCTHUNT_TREND_INTERVAL_MS, collectFn: collectProductHunt, restoreFn: (data: any) => updateTrends(data.source, data.trends), delay: 30_000 },
];

export function startTrendCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("📈 Trend collectors started");
}

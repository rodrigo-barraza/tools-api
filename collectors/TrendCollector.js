import {
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
} from "../constants.js";
import { upsertTrends } from "../models/Trend.js";
import { fetchGoogleTrends } from "../fetchers/trend/GoogleTrendsFetcher.js";
import { fetchRedditTrends } from "../fetchers/trend/RedditFetcher.js";
import { fetchWikipediaTrends } from "../fetchers/trend/WikipediaFetcher.js";
import { fetchHackerNewsTrends } from "../fetchers/trend/HackerNewsFetcher.js";
import { fetchAllXTrends } from "../fetchers/trend/XTrendsFetcher.js";
import { fetchGoogleNews } from "../fetchers/trend/GoogleNewsFetcher.js";
import { fetchMastodonTrends } from "../fetchers/trend/MastodonFetcher.js";
import { fetchTVMazeTrends } from "../fetchers/trend/TVMazeFetcher.js";
import { fetchBlueskyTrends } from "../fetchers/trend/BlueskyFetcher.js";
import { fetchGitHubTrending } from "../fetchers/trend/GitHubTrendingFetcher.js";
import { fetchProductHuntTrends } from "../fetchers/trend/ProductHuntFetcher.js";
import { updateTrends, setTrendError } from "../caches/TrendCache.js";

async function collectGoogleTrends() {
  try {
    const trends = await fetchGoogleTrends();
    updateTrends("google-trends", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Google Trends] ✅ ${trends.length} trends | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("google-trends", error);
    console.error(`[Google Trends] ❌ ${error.message}`);
  }
}

async function collectReddit() {
  try {
    const trends = await fetchRedditTrends();
    updateTrends("reddit", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Reddit] ✅ ${trends.length} trends | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("reddit", error);
    console.error(`[Reddit] ❌ ${error.message}`);
  }
}

async function collectWikipedia() {
  try {
    const trends = await fetchWikipediaTrends();
    updateTrends("wikipedia", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Wikipedia] ✅ ${trends.length} articles | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("wikipedia", error);
    console.error(`[Wikipedia] ❌ ${error.message}`);
  }
}

async function collectHackerNews() {
  try {
    const trends = await fetchHackerNewsTrends();
    updateTrends("hackernews", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Hacker News] ✅ ${trends.length} stories | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("hackernews", error);
    console.error(`[Hacker News] ❌ ${error.message}`);
  }
}

async function collectXTrends() {
  try {
    const trends = await fetchAllXTrends();
    updateTrends("x", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[X] ✅ ${trends.length} trending topics | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("x", error);
    console.error(`[X] ❌ ${error.message}`);
  }
}

async function collectGoogleNews() {
  try {
    const trends = await fetchGoogleNews();
    updateTrends("google-news", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Google News] ✅ ${trends.length} articles | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("google-news", error);
    console.error(`[Google News] ❌ ${error.message}`);
  }
}

async function collectMastodon() {
  try {
    const trends = await fetchMastodonTrends();
    updateTrends("mastodon", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Mastodon] ✅ ${trends.length} trending items | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("mastodon", error);
    console.error(`[Mastodon] ❌ ${error.message}`);
  }
}

async function collectTVMaze() {
  try {
    const trends = await fetchTVMazeTrends();
    updateTrends("tvmaze", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[TVMaze] ✅ ${trends.length} shows | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("tvmaze", error);
    console.error(`[TVMaze] ❌ ${error.message}`);
  }
}

async function collectBluesky() {
  try {
    const trends = await fetchBlueskyTrends();
    updateTrends("bluesky", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Bluesky] ✅ ${trends.length} trending items | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("bluesky", error);
    console.error(`[Bluesky] ❌ ${error.message}`);
  }
}

async function collectGitHubTrending() {
  try {
    const trends = await fetchGitHubTrending();
    updateTrends("github", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[GitHub Trending] ✅ ${trends.length} repos | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("github", error);
    console.error(`[GitHub Trending] ❌ ${error.message}`);
  }
}

async function collectProductHunt() {
  try {
    const trends = await fetchProductHuntTrends();
    updateTrends("producthunt", trends);
    const result = await upsertTrends(trends);
    console.log(
      `[Product Hunt] ✅ ${trends.length} products | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setTrendError("producthunt", error);
    console.error(`[Product Hunt] ❌ ${error.message}`);
  }
}

export function startTrendCollectors() {
  collectGoogleTrends();
  setTimeout(collectWikipedia, 3_000);
  setTimeout(collectHackerNews, 6_000);
  setTimeout(collectReddit, 9_000);
  setTimeout(collectXTrends, 12_000);
  setTimeout(collectGoogleNews, 15_000);
  setTimeout(collectMastodon, 18_000);
  setTimeout(collectTVMaze, 21_000);
  setTimeout(collectBluesky, 24_000);
  setTimeout(collectGitHubTrending, 27_000);
  setTimeout(collectProductHunt, 30_000);

  setInterval(collectGoogleTrends, GOOGLE_TRENDS_INTERVAL_MS);
  setInterval(collectWikipedia, WIKIPEDIA_INTERVAL_MS);
  setInterval(collectHackerNews, HACKERNEWS_INTERVAL_MS);
  setInterval(collectReddit, REDDIT_INTERVAL_MS);
  setInterval(collectXTrends, X_TRENDS_INTERVAL_MS);
  setInterval(collectGoogleNews, GOOGLE_NEWS_INTERVAL_MS);
  setInterval(collectMastodon, MASTODON_INTERVAL_MS);
  setInterval(collectTVMaze, TVMAZE_INTERVAL_MS);
  setInterval(collectBluesky, BLUESKY_INTERVAL_MS);
  setInterval(collectGitHubTrending, GITHUB_TRENDING_INTERVAL_MS);
  setInterval(collectProductHunt, PRODUCTHUNT_TREND_INTERVAL_MS);

  console.log("📈 Trend collectors started");
}

import { normalizeName } from "@rodrigo-barraza/utilities-library";
import {
  TREND_SOURCES as SOURCES,
  HACKERNEWS_TOP_STORY_LIMIT,
  TREND_CATEGORIES,
} from "../../constants.ts";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

/**
 * Fetches a single Hacker News item by ID.

 */
async function fetchItem(id: number) {
  const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
  if (!response.ok) return null;
  return response.json();
}

/**
 * Fetches the top stories from Hacker News.
 * Uses the Firebase-based HN API (completely free, no auth required).
 */
export async function fetchHackerNewsTrends() {
  const response = await fetch(`${HN_API_BASE}/topstories.json`);
  if (!response.ok) {
    throw new Error(`HN API returned ${response.status}: ${response.statusText}`);
  }

  const storyIds = await response.json();
  const topIds = storyIds.slice(0, HACKERNEWS_TOP_STORY_LIMIT);

  // Fetch all stories in parallel
  const stories = await Promise.all(topIds.map(fetchItem));

  return stories
    .filter((s: Record<string, any> | null) => s && s.title)
    .map((story: Record<string, any>, index: number) => ({
      name: story.title,
      normalizedName: normalizeName(story.title),
      source: SOURCES.HACKERNEWS,
      volume: story.score || 0,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      context: {
        hnId: story.id,
        hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
        author: story.by,
        commentCount: story.descendants || 0,
        rank: index + 1,
        created: new Date((story.time || 0) * 1000).toISOString(),
      },
      category: TREND_CATEGORIES.TECHNOLOGY,
      timestamp: new Date().toISOString(),
    }));
}

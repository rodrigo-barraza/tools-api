import { TokenManager } from "@rodrigo-barraza/utilities-library/node";
import { normalizeName } from "@rodrigo-barraza/utilities-library";
import CONFIG from "../../config.ts";
import {
  TREND_SOURCES as SOURCES,
  REDDIT_SUBREDDITS,
  REDDIT_POSTS_PER_SUBREDDIT,
} from "../../constants.ts";

import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
const redditTokenManager = new TokenManager(async () => {
  const credentials = Buffer.from(
    `${CONFIG.REDDIT_CLIENT_ID}:${CONFIG.REDDIT_CLIENT_SECRET}`,
  ).toString("base64");
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    // @ts-expect-error - suppress remaining error
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": CONFIG.REDDIT_USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    throw new Error(`Reddit auth failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return {
    token: data.access_token,
    expiresInMs: (data.expires_in - 60) * 1000,
  };
});
/**
 * Fetches hot posts from a given subreddit.


 */
async function fetchSubreddit(subreddit: any, token: any, limit: any) {
  const url = `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=${limit}&raw_json=1`;
  const response = await fetch(url, {
    // @ts-expect-error - suppress remaining error
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": CONFIG.REDDIT_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Reddit /r/${subreddit}: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data?.data?.children || [];
}
/**
 * Normalizes a Reddit post into a trend object.


 */
function normalizeTrend(post: any, defaultCategory: any) {
  const postData = post.data;
  return {
    name: postData.title,
    normalizedName: normalizeName(postData.title),
    source: SOURCES.REDDIT,
    volume: postData.score || 0,
    url: `https://reddit.com${postData.permalink}`,
    context: {
      subreddit: postData.subreddit,
      author: postData.author,
      commentCount: postData.num_comments || 0,
      upvoteRatio: postData.upvote_ratio || 0,
      flair: postData.link_flair_text || null,
      thumbnail:
        postData.thumbnail && postData.thumbnail.startsWith("http") ? postData.thumbnail : null,
      isVideo: postData.is_video || false,
      created: new Date(postData.created_utc * 1000).toISOString(),
    },
    category: defaultCategory,
    timestamp: new Date().toISOString(),
  };
}
/**
 * Fetches trending posts from all configured subreddits.
 * Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET to be configured.
 */
export async function fetchRedditTrends() {
  if (!CONFIG.REDDIT_CLIENT_ID || !CONFIG.REDDIT_CLIENT_SECRET) {
    throw new Error("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not configured");
  }
  const token = await redditTokenManager.getToken();
  const allTrends: any[] = [];
  for (const sub of REDDIT_SUBREDDITS) {
    await rateLimiter.wait("REDDIT");
    try {
      const posts = await fetchSubreddit(
        sub.name,
        token,
        REDDIT_POSTS_PER_SUBREDDIT,
      );
      const trends = posts
        .filter((p: any) => !p.data.stickied) // exclude stickied/pinned posts
        .map((p: any) => normalizeTrend(p, sub.category));
      allTrends.push(...trends);
    } catch (error: unknown) {
      logger.error(`[Reddit] ❌ /r/${sub.name}: ${(error as Error).message}`);
    }
  }
  return allTrends;
}

import CONFIG from "../../config.js";
import {
  TREND_SOURCES as SOURCES,
  REDDIT_SUBREDDITS,
  REDDIT_POSTS_PER_SUBREDDIT,
} from "../../constants.js";

let accessToken = null;
let tokenExpiry = 0;

/**
 * Obtain an OAuth2 access token from Reddit (client credentials grant).
 * @returns {Promise<string>} Bearer access token
 */
async function authenticate() {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const credentials = Buffer.from(
    `${CONFIG.REDDIT_CLIENT_ID}:${CONFIG.REDDIT_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": CONFIG.REDDIT_USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

/**
 * Fetches hot posts from a given subreddit.
 * @param {string} subreddit - Subreddit name (without r/)
 * @param {string} token - OAuth2 bearer token
 * @param {number} limit - Number of posts to fetch
 * @returns {Promise<Array>} Raw post data
 */
async function fetchSubreddit(subreddit, token, limit) {
  const url = `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=${limit}&raw_json=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": CONFIG.REDDIT_USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit /r/${subreddit}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data?.data?.children || [];
}

/**
 * Normalizes a Reddit post into a trend object.
 * @param {object} post - Reddit post data
 * @param {string|null} defaultCategory - Category from subreddit config
 * @returns {object} Normalized trend object
 */
function normalizeTrend(post, defaultCategory) {
  const d = post.data;
  return {
    name: d.title,
    normalizedName: d.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, " "),
    source: SOURCES.REDDIT,
    volume: d.score || 0,
    url: `https://reddit.com${d.permalink}`,
    context: {
      subreddit: d.subreddit,
      author: d.author,
      commentCount: d.num_comments || 0,
      upvoteRatio: d.upvote_ratio || 0,
      flair: d.link_flair_text || null,
      thumbnail:
        d.thumbnail && d.thumbnail.startsWith("http") ? d.thumbnail : null,
      isVideo: d.is_video || false,
      created: new Date(d.created_utc * 1000).toISOString(),
    },
    category: defaultCategory,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetches trending posts from all configured subreddits.
 * Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET to be configured.
 * @returns {Promise<Array>} Normalized trend objects
 */
export async function fetchRedditTrends() {
  if (!CONFIG.REDDIT_CLIENT_ID || !CONFIG.REDDIT_CLIENT_SECRET) {
    throw new Error("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not configured");
  }

  const token = await authenticate();
  const allTrends = [];

  for (const sub of REDDIT_SUBREDDITS) {
    try {
      const posts = await fetchSubreddit(
        sub.name,
        token,
        REDDIT_POSTS_PER_SUBREDDIT,
      );
      const trends = posts
        .filter((p) => !p.data.stickied) // exclude stickied/pinned posts
        .map((p) => normalizeTrend(p, sub.category));
      allTrends.push(...trends);
    } catch (error) {
      console.error(`[Reddit] ❌ /r/${sub.name}: ${error.message}`);
    }
  }

  return allTrends;
}

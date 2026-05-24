// ─── Thread Content + Top Comments ──────────────────────────

import { USER_AGENT } from "../../constants.ts";
import { errorMessage } from "../../utilities.ts";

const MAX_COMMENTS = 20;
const MAX_BODY_CHARS = 10_000;

// ─── URL Parsing ───────────────────────────────────────────────────

const REDDIT_THREAD_REGEX =
  /(?:https?:\/\/)?(?:(?:www|old|new)\.)?reddit\.com\/(r\/[^/]+\/comments\/[a-z0-9]+[^?\s]*)/i;

const REDD_IT_REGEX = /(?:https?:\/\/)?redd\.it\/([a-z0-9]+)/i;

/**
 * Normalize a Reddit URL to its .json endpoint.


 */
function buildRedditJsonUrl(input: string) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Full reddit.com URL
  const fullMatch = trimmed.match(REDDIT_THREAD_REGEX);
  if (fullMatch) {
    const path = fullMatch[1].replace(/\/$/, "");
    return `https://www.reddit.com/${path}.json`;
  }

  // redd.it short URL
  const shortMatch = trimmed.match(REDD_IT_REGEX);
  if (shortMatch) {
    return `https://www.reddit.com/comments/${shortMatch[1]}.json`;
  }

  // Bare path like r/programming/comments/abc123/title
  if (trimmed.startsWith("r/") && trimmed.includes("/comments/")) {
    return `https://www.reddit.com/${trimmed.replace(/\/$/, "")}.json`;
  }

  return null;
}

// ─── Comment Tree Flattening ──────────────────────────────────────

interface RedditCommentChild {
  kind: string;
  data: {
    author?: string;
    score?: number;
    body?: string;
    created_utc?: number;
    is_submitter?: boolean;
    depth?: number;
    total_awards_received?: number;
    replies?: { data?: { children?: RedditCommentChild[] } } | string;
  };
}

function extractComments(children: RedditCommentChild[], limit: number) {
  const comments: unknown[] = [];

  for (const child of children) {
    if (comments.length >= limit) break;
    if (child.kind !== "t1") continue;

    const c = child.data;
    const body = c.body || "";
    comments.push({
      author: c.author,
      score: c.score,
      body: body.length > MAX_BODY_CHARS
        ? body.slice(0, MAX_BODY_CHARS) + "... [truncated]"
        : body,
      createdUtc: c.created_utc,
      isOp: c.is_submitter || false,
      depth: c.depth || 0,
      awards: c.total_awards_received || 0,
    });

    // Recurse into replies (flatten tree) — replies can be "" or {data:{children:[]}}
    const replies = typeof c.replies === "object" && c.replies ? c.replies : null;
    if (replies?.data?.children?.length && comments.length < limit) {
      const nested = extractComments(replies.data.children, limit - comments.length);
      comments.push(...nested);
    }
  }

  return comments;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch a Reddit thread with post content and top comments.


 */
export async function getRedditThread(input: string, options: { commentLimit?: number } = {}) {
  const jsonUrl = buildRedditJsonUrl(input);
  if (!jsonUrl) {
    return { error: `Invalid Reddit URL: "${input}"` };
  }

  const { commentLimit = MAX_COMMENTS } = options;

  try {
    const response = await fetch(jsonUrl, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return { error: "Reddit thread not found" };
      if (response.status === 429) return { error: "Reddit rate limit exceeded" };
      return { error: `Reddit API error: ${response.status}` };
    }

    const data = await response.json();

    // Reddit returns [post_listing, comment_listing]
    const post = data[0]?.data?.children?.[0]?.data;
    if (!post) {
      return { error: "Could not parse Reddit response" };
    }

    const commentChildren = data[1]?.data?.children || [];
    const comments = extractComments(commentChildren, commentLimit);

    const selfText = post.selftext || "";

    return {
      title: post.title,
      author: post.author,
      subreddit: post.subreddit_name_prefixed,
      score: post.score,
      upvoteRatio: post.upvote_ratio,
      url: `https://www.reddit.com${post.permalink}`,
      externalUrl: post.url !== `https://www.reddit.com${post.permalink}` ? post.url : null,
      selfText: selfText.length > MAX_BODY_CHARS
        ? selfText.slice(0, MAX_BODY_CHARS) + "... [truncated]"
        : selfText,
      commentCount: post.num_comments,
      createdUtc: post.created_utc,
      flair: post.link_flair_text || null,
      isNsfw: post.over_18 || false,
      isPinned: post.stickied || false,
      awards: post.total_awards_received || 0,
      domain: post.domain || null,
      comments,
    };
  } catch (error: unknown) {
    return { error: `Reddit fetch failed: ${errorMessage(error)}` };
  }
}

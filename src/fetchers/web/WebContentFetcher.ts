// ─── Unified URL → Structured Content ───────────────────────

import { getRedditThread } from "./RedditFetcher.ts";
import { getTwitterPost } from "./TwitterFetcher.ts";
import { getHackerNewsThread } from "./HackerNewsFetcher.ts";
import { getStackOverflowQuestion } from "./StackOverflowFetcher.ts";
import { getGitHubRepo } from "./GitHubFetcher.ts";
import { getYouTubeVideoInfo } from "../knowledge/YouTubeFetcher.ts";
import { fetchGenericPage } from "./GenericPageFetcher.ts";

// ─── Platform Detection ──────────────────────────────────────────
// Order matters: more specific patterns first, catch-alls last.

const PLATFORM_PATTERNS = [
  {
    platform: "youtube",
    test: (url: any) =>
      /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(url),
  },
  {
    platform: "reddit",
    test: (url: any) =>
      /(?:reddit\.com|redd\.it)/i.test(url) ||
      /^r\/\w+\/comments\//i.test(url),
  },
  {
    platform: "twitter",
    test: (url: any) =>
      /(?:twitter\.com|x\.com|fixupx\.com|fxtwitter\.com|vxtwitter\.com|nitter\.\w+)/i.test(url) ||
      (/\/status\/\d+/i.test(url) && !/reddit|github|stackoverflow/i.test(url)),
  },
  {
    platform: "hackernews",
    test: (url: any) =>
      /(?:news\.ycombinator\.com)/i.test(url),
  },
  {
    platform: "stackoverflow",
    test: (url: any) =>
      /(?:stackoverflow\.com|stackexchange\.com)/i.test(url) ||
      /^(?:stackoverflow|so):\d+$/i.test(url),
  },
  {
    platform: "github",
    test: (url: any) =>
      /(?:github\.com)/i.test(url) ||
      // owner/repo shorthand: must have exactly one slash, no dots in TLD pattern
      /^[a-zA-Z][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_.-]+$/.test(url),
  },
];

/**
 * Detect which platform a URL belongs to.

 */
function detectPlatform(url: any) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  for (const { platform, test } of PLATFORM_PATTERNS) {
    if (test(trimmed)) return platform;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Extract structured content from any URL.
 * Auto-detects GitHub, Reddit, Twitter/X, Hacker News, Stack Overflow,
 * or YouTube. Falls back to generic HTML extraction for unknown sites.
 */
export async function getWebContent(url: any, options: Record<string, any> = {}) {
  const platform = detectPlatform(url);

  let result: any;

  switch (platform) {
    case "youtube":
      result = await getYouTubeVideoInfo(url, {
        lang: options.lang,
        includeTranscript: options.transcript !== "false",
        includeTimestamps: true,
      });
      break;

    case "reddit":
      result = await getRedditThread(url, {
        commentLimit: options.commentLimit ? parseInt(options.commentLimit, 10) : undefined,
      });
      break;

    case "twitter":
      result = await getTwitterPost(url);
      break;

    case "hackernews":
      result = await getHackerNewsThread(url, {
        commentLimit: options.commentLimit ? parseInt(options.commentLimit, 10) : undefined,
      });
      break;

    case "stackoverflow": {
      // Strip "so:" or "stackoverflow:" prefix if used
      const soUrl = url.replace(/^(?:stackoverflow|so):/i, "");
      result = await getStackOverflowQuestion(soUrl, {
        answerLimit: options.answerLimit ? parseInt(options.answerLimit, 10) : undefined,
      });
      break;
    }

    case "github":
      result = await getGitHubRepo(url, {
        includeReadme: options.readme !== "false",
        includeLanguages: options.languages !== "false",
      });
      break;

    default:
      // Generic fallback — fetch + Cheerio extraction
      result = await fetchGenericPage(url, {
        maxChars: options.maxChars,
      });
      break;
  }

  // Tag the result with the detected platform
  if (result && !result.error) {
    result.platform = platform || "generic";
  }

  return result;
}

export { detectPlatform };

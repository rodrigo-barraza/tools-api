// ─── Reddit Search Fetcher (Full-Text Post + Comment Search) ─

import { redditApiRequest, delayBetweenRequests } from "./RedditClient.ts";
import { errorMessage } from "../../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────────

const MAX_RESULTS_PER_PAGE = 100;
const DEFAULT_RESULTS_LIMIT = 25;
const DEFAULT_MAX_PAGES = 5;
const MAX_BODY_CHARACTERS = 1_500;

type SearchResultType = "link" | "comment";
type SearchSortOrder = "relevance" | "new" | "hot" | "top" | "comments";
type SearchTimeRange = "hour" | "day" | "week" | "month" | "year" | "all";

// ─── Response Interfaces ───────────────────────────────────────────

interface RedditSearchListingResponse {
  kind: string;
  data: {
    after: string | null;
    children: RedditSearchChild[];
  };
}

interface RedditSearchChild {
  kind: string;
  data: Record<string, unknown>;
}

// ─── Normalized Results ────────────────────────────────────────────

interface NormalizedSearchPost {
  type: "post";
  subreddit: string;
  title: string;
  selfText: string;
  author: string;
  score: number;
  upvoteRatio: number;
  commentCount: number;
  createdUtc: number;
  permalink: string;
  externalUrl: string | null;
  isNsfw: boolean;
  flair: string | null;
  awards: number;
  domain: string | null;
}

interface NormalizedSearchComment {
  type: "comment";
  subreddit: string;
  postTitle: string;
  body: string;
  author: string;
  score: number;
  createdUtc: number;
  permalink: string;
}

type NormalizedSearchResult = NormalizedSearchPost | NormalizedSearchComment;

// ─── Normalization ─────────────────────────────────────────────────

function truncateText(text: string): string {
  if (!text || text.length <= MAX_BODY_CHARACTERS) return text || "";
  return text.slice(0, MAX_BODY_CHARACTERS) + "... [truncated]";
}

function normalizeSearchChild(
  child: RedditSearchChild,
): NormalizedSearchResult | null {
  const childData = child.data;

  if (child.kind === "t3") {
    const permalink = childData.permalink as string;
    const fullPermalink = `https://www.reddit.com${permalink}`;
    const externalUrl = childData.url as string;

    return {
      type: "post",
      subreddit:
        (childData.subreddit_name_prefixed as string) ||
        `r/${childData.subreddit as string}`,
      title: (childData.title as string) || "",
      selfText: truncateText(childData.selftext as string),
      author: (childData.author as string) || "[deleted]",
      score: (childData.score as number) || 0,
      upvoteRatio: (childData.upvote_ratio as number) || 0,
      commentCount: (childData.num_comments as number) || 0,
      createdUtc: (childData.created_utc as number) || 0,
      permalink: fullPermalink,
      externalUrl: externalUrl !== fullPermalink ? externalUrl : null,
      isNsfw: (childData.over_18 as boolean) || false,
      flair: (childData.link_flair_text as string) || null,
      awards: (childData.total_awards_received as number) || 0,
      domain: (childData.domain as string) || null,
    };
  }

  if (child.kind === "t1") {
    return {
      type: "comment",
      subreddit:
        (childData.subreddit_name_prefixed as string) ||
        `r/${childData.subreddit as string}`,
      postTitle: (childData.link_title as string) || "",
      body: truncateText(childData.body as string),
      author: (childData.author as string) || "[deleted]",
      score: (childData.score as number) || 0,
      createdUtc: (childData.created_utc as number) || 0,
      permalink: `https://www.reddit.com${childData.permalink as string}`,
    };
  }

  return null;
}

// ─── Public API ────────────────────────────────────────────────────

interface RedditSearchOptions {
  subreddit?: string;
  type?: SearchResultType;
  sort?: SearchSortOrder;
  timeRange?: SearchTimeRange;
  limit?: number;
  maxPages?: number;
  includeNsfw?: boolean;
}

interface RedditSearchResult {
  query: string;
  subreddit: string | null;
  resultType: SearchResultType;
  sort: SearchSortOrder;
  timeRange: SearchTimeRange;
  results: NormalizedSearchResult[];
  resultCount: number;
  hasMore: boolean;
  pagesRetrieved: number;
}

export async function searchReddit(
  query: string,
  options: RedditSearchOptions = {},
): Promise<RedditSearchResult | { error: string }> {
  if (!query || !query.trim()) {
    return { error: "Search query is required" };
  }

  const {
    subreddit,
    type = "link",
    sort = "relevance",
    timeRange = "all",
    limit = DEFAULT_RESULTS_LIMIT,
    maxPages = DEFAULT_MAX_PAGES,
    includeNsfw = false,
  } = options;

  const effectiveResultsPerPage = Math.min(limit, MAX_RESULTS_PER_PAGE);
  const effectiveMaxPages = Math.min(maxPages, DEFAULT_MAX_PAGES);

  const endpoint = subreddit
    ? `/r/${encodeURIComponent(subreddit)}/search`
    : "/search";

  try {
    const allResults: NormalizedSearchResult[] = [];
    let afterCursor: string | null = null;
    let pagesRetrieved = 0;
    let hasMore = false;

    for (let pageIndex = 0; pageIndex < effectiveMaxPages; pageIndex++) {
      const parameters: Record<string, string> = {
        q: query.trim(),
        type,
        sort,
        t: timeRange,
        limit: effectiveResultsPerPage.toString(),
      };

      if (subreddit) {
        parameters.restrict_sr = "true";
      }

      if (!includeNsfw) {
        parameters.include_over_18 = "false";
      }

      if (afterCursor) {
        parameters.after = afterCursor;
        parameters.count = allResults.length.toString();
      }

      if (pageIndex > 0) {
        await delayBetweenRequests();
      }

      const listing =
        await redditApiRequest<RedditSearchListingResponse>(
          endpoint,
          parameters,
        );

      pagesRetrieved++;

      const pageChildren = listing.data.children || [];

      for (const child of pageChildren) {
        const normalizedResult = normalizeSearchChild(child);
        if (normalizedResult) {
          allResults.push(normalizedResult);
        }
      }

      afterCursor = listing.data.after;

      if (!afterCursor || pageChildren.length < effectiveResultsPerPage) {
        hasMore = !!afterCursor;
        break;
      }

      if (allResults.length >= limit) {
        hasMore = true;
        break;
      }
    }

    const trimmedResults = allResults.slice(0, limit);

    return {
      query: query.trim(),
      subreddit: subreddit || null,
      resultType: type,
      sort,
      timeRange,
      results: trimmedResults,
      resultCount: trimmedResults.length,
      hasMore: hasMore || allResults.length > limit,
      pagesRetrieved,
    };
  } catch (error: unknown) {
    return { error: `Reddit search failed: ${errorMessage(error)}` };
  }
}

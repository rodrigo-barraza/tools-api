// ─── Reddit Subreddit Fetcher (Discovery, Feed, Wiki, Rules) ─

import { redditApiRequest } from "./RedditClient.ts";
import { errorMessage } from "../../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────────

const MAX_FEED_ITEMS = 100;
const DEFAULT_FEED_LIMIT = 25;
const MAX_BODY_CHARACTERS = 1_500;
const DEFAULT_SEARCH_LIMIT = 10;

type FeedSortOrder = "hot" | "new" | "top" | "rising" | "controversial";
type FeedTimeRange = "hour" | "day" | "week" | "month" | "year" | "all";

// ─── Response Interfaces ───────────────────────────────────────────

interface RedditListingResponse {
  kind: string;
  data: {
    after: string | null;
    children: Array<{ kind: string; data: Record<string, unknown> }>;
  };
}

interface RedditSubredditAboutResponse {
  kind: string;
  data: {
    display_name: string;
    display_name_prefixed: string;
    title: string;
    public_description: string;
    description: string;
    subscribers: number;
    accounts_active: number;
    created_utc: number;
    over18: boolean;
    subreddit_type: string;
    lang: string;
    icon_img: string;
    banner_img: string;
    community_icon: string;
    header_img: string;
    key_color: string;
    primary_color: string;
    allow_images: boolean;
    allow_videos: boolean;
    wiki_enabled: boolean;
    url: string;
  };
}

interface RedditRulesResponse {
  rules: Array<{
    kind: string;
    description: string;
    short_name: string;
    violation_reason: string;
    created_utc: number;
    priority: number;
  }>;
  site_rules: string[];
}

interface RedditWikiPageResponse {
  kind: string;
  data: {
    content_md: string;
    content_html: string;
    revision_date: number;
    revision_by: { data: { name: string } };
    reason: string | null;
  };
}

interface RedditWikiPagesResponse {
  kind: string;
  data: string[];
}

// ─── Normalized Types ──────────────────────────────────────────────

interface NormalizedSubredditInfo {
  name: string;
  namePrefixed: string;
  title: string;
  publicDescription: string;
  fullDescription: string;
  subscribers: number;
  activeUsers: number;
  createdUtc: number;
  isNsfw: boolean;
  type: string;
  language: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  isWikiEnabled: boolean;
  url: string;
}

interface NormalizedSubredditSearchResult {
  name: string;
  namePrefixed: string;
  title: string;
  description: string;
  subscribers: number;
  activeUsers: number;
  isNsfw: boolean;
  iconUrl: string | null;
  url: string;
}

interface NormalizedFeedPost {
  title: string;
  author: string;
  selfText: string;
  score: number;
  upvoteRatio: number;
  commentCount: number;
  createdUtc: number;
  permalink: string;
  externalUrl: string | null;
  isNsfw: boolean;
  isPinned: boolean;
  flair: string | null;
  awards: number;
  domain: string | null;
  thumbnail: string | null;
}

interface NormalizedRule {
  index: number;
  title: string;
  description: string;
  violationReason: string;
}

interface NormalizedWikiPage {
  page: string;
  content: string;
  lastRevisionUtc: number;
  revisedBy: string;
}

// ─── Normalization Helpers ─────────────────────────────────────────

function truncateText(text: string, maxLength: number = MAX_BODY_CHARACTERS): string {
  if (!text || text.length <= maxLength) return text || "";
  return text.slice(0, maxLength) + "... [truncated]";
}

function cleanIconUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleaned = url.split("?")[0];
  return cleaned && cleaned.startsWith("http") ? cleaned : null;
}

function normalizeFeedPost(
  childData: Record<string, unknown>,
): NormalizedFeedPost {
  const permalink = childData.permalink as string;
  const fullPermalink = `https://www.reddit.com${permalink}`;
  const externalUrl = childData.url as string;
  const thumbnail = childData.thumbnail as string;

  return {
    title: (childData.title as string) || "",
    author: (childData.author as string) || "[deleted]",
    selfText: truncateText(childData.selftext as string),
    score: (childData.score as number) || 0,
    upvoteRatio: (childData.upvote_ratio as number) || 0,
    commentCount: (childData.num_comments as number) || 0,
    createdUtc: (childData.created_utc as number) || 0,
    permalink: fullPermalink,
    externalUrl: externalUrl !== fullPermalink ? externalUrl : null,
    isNsfw: (childData.over_18 as boolean) || false,
    isPinned: (childData.stickied as boolean) || false,
    flair: (childData.link_flair_text as string) || null,
    awards: (childData.total_awards_received as number) || 0,
    domain: (childData.domain as string) || null,
    thumbnail:
      thumbnail && thumbnail.startsWith("http") ? thumbnail : null,
  };
}

// ─── Public API: Subreddit Info ────────────────────────────────────

export async function getSubredditInfo(
  subredditName: string,
): Promise<NormalizedSubredditInfo | { error: string }> {
  try {
    const response =
      await redditApiRequest<RedditSubredditAboutResponse>(
        `/r/${encodeURIComponent(subredditName)}/about`,
      );

    const subredditData = response.data;

    return {
      name: subredditData.display_name,
      namePrefixed: subredditData.display_name_prefixed,
      title: subredditData.title,
      publicDescription: subredditData.public_description || "",
      fullDescription: truncateText(subredditData.description, 5_000),
      subscribers: subredditData.subscribers,
      activeUsers: subredditData.accounts_active,
      createdUtc: subredditData.created_utc,
      isNsfw: subredditData.over18 || false,
      type: subredditData.subreddit_type,
      language: subredditData.lang || "en",
      iconUrl:
        cleanIconUrl(subredditData.community_icon) ||
        cleanIconUrl(subredditData.icon_img),
      bannerUrl: cleanIconUrl(subredditData.banner_img),
      primaryColor: subredditData.primary_color || subredditData.key_color || null,
      isWikiEnabled: subredditData.wiki_enabled || false,
      url: `https://www.reddit.com${subredditData.url}`,
    };
  } catch (error: unknown) {
    return {
      error: `Subreddit info fetch failed: ${errorMessage(error)}`,
    };
  }
}

// ─── Public API: Subreddit Search / Discovery ──────────────────────

interface SubredditSearchOptions {
  limit?: number;
  includeNsfw?: boolean;
}

interface SubredditSearchResult {
  query: string;
  subreddits: NormalizedSubredditSearchResult[];
  resultCount: number;
}

export async function searchSubreddits(
  query: string,
  options: SubredditSearchOptions = {},
): Promise<SubredditSearchResult | { error: string }> {
  if (!query || !query.trim()) {
    return { error: "Search query is required" };
  }

  const {
    limit = DEFAULT_SEARCH_LIMIT,
    includeNsfw = false,
  } = options;

  try {
    const parameters: Record<string, string> = {
      q: query.trim(),
      limit: Math.min(limit, 25).toString(),
      show: "all",
    };

    if (!includeNsfw) {
      parameters.include_over_18 = "false";
    }

    const listing =
      await redditApiRequest<RedditListingResponse>(
        "/subreddits/search",
        parameters,
      );

    const subreddits: NormalizedSubredditSearchResult[] = [];

    for (const child of listing.data.children) {
      if (child.kind !== "t5") continue;
      const subredditData = child.data;

      subreddits.push({
        name: subredditData.display_name as string,
        namePrefixed: subredditData.display_name_prefixed as string,
        title: (subredditData.title as string) || "",
        description: (subredditData.public_description as string) || "",
        subscribers: (subredditData.subscribers as number) || 0,
        activeUsers: (subredditData.accounts_active as number) || 0,
        isNsfw: (subredditData.over18 as boolean) || false,
        iconUrl:
          cleanIconUrl(subredditData.community_icon as string) ||
          cleanIconUrl(subredditData.icon_img as string),
        url: `https://www.reddit.com${subredditData.url as string}`,
      });
    }

    return {
      query: query.trim(),
      subreddits,
      resultCount: subreddits.length,
    };
  } catch (error: unknown) {
    return { error: `Subreddit search failed: ${errorMessage(error)}` };
  }
}

// ─── Public API: Subreddit Feed (Hot / Top / New / Rising) ─────────

interface SubredditFeedOptions {
  sort?: FeedSortOrder;
  timeRange?: FeedTimeRange;
  limit?: number;
  excludePinned?: boolean;
}

interface SubredditFeedResult {
  subreddit: string;
  sort: FeedSortOrder;
  timeRange: FeedTimeRange;
  posts: NormalizedFeedPost[];
  postCount: number;
  hasMore: boolean;
}

export async function getSubredditFeed(
  subredditName: string,
  options: SubredditFeedOptions = {},
): Promise<SubredditFeedResult | { error: string }> {
  const {
    sort = "hot",
    timeRange = "day",
    limit = DEFAULT_FEED_LIMIT,
    excludePinned = true,
  } = options;

  const effectiveLimit = Math.min(limit, MAX_FEED_ITEMS);

  try {
    const parameters: Record<string, string> = {
      limit: effectiveLimit.toString(),
    };

    if (sort === "top" || sort === "controversial") {
      parameters.t = timeRange;
    }

    const listing =
      await redditApiRequest<RedditListingResponse>(
        `/r/${encodeURIComponent(subredditName)}/${sort}`,
        parameters,
      );

    let posts: NormalizedFeedPost[] = [];

    for (const child of listing.data.children) {
      if (child.kind !== "t3") continue;
      const normalizedPost = normalizeFeedPost(child.data);
      if (excludePinned && normalizedPost.isPinned) continue;
      posts.push(normalizedPost);
    }

    posts = posts.slice(0, limit);

    return {
      subreddit: subredditName,
      sort,
      timeRange,
      posts,
      postCount: posts.length,
      hasMore: !!listing.data.after,
    };
  } catch (error: unknown) {
    return { error: `Subreddit feed fetch failed: ${errorMessage(error)}` };
  }
}

// ─── Public API: Subreddit Rules ───────────────────────────────────

interface SubredditRulesResult {
  subreddit: string;
  rules: NormalizedRule[];
  ruleCount: number;
  siteRules: string[];
}

export async function getSubredditRules(
  subredditName: string,
): Promise<SubredditRulesResult | { error: string }> {
  try {
    const response = await redditApiRequest<RedditRulesResponse>(
      `/r/${encodeURIComponent(subredditName)}/about/rules`,
    );

    const rules: NormalizedRule[] = (response.rules || []).map(
      (rule, index) => ({
        index: index + 1,
        title: rule.short_name || "",
        description: rule.description || "",
        violationReason: rule.violation_reason || "",
      }),
    );

    return {
      subreddit: subredditName,
      rules,
      ruleCount: rules.length,
      siteRules: response.site_rules || [],
    };
  } catch (error: unknown) {
    return { error: `Subreddit rules fetch failed: ${errorMessage(error)}` };
  }
}

// ─── Public API: Subreddit Wiki ────────────────────────────────────

interface SubredditWikiPagesResult {
  subreddit: string;
  pages: string[];
  pageCount: number;
}

export async function getSubredditWikiPages(
  subredditName: string,
): Promise<SubredditWikiPagesResult | { error: string }> {
  try {
    const response = await redditApiRequest<RedditWikiPagesResponse>(
      `/r/${encodeURIComponent(subredditName)}/wiki/pages`,
    );

    const pages = response.data || [];

    return {
      subreddit: subredditName,
      pages,
      pageCount: pages.length,
    };
  } catch (error: unknown) {
    return {
      error: `Subreddit wiki pages fetch failed: ${errorMessage(error)}`,
    };
  }
}

export async function getSubredditWikiPage(
  subredditName: string,
  pageName: string = "index",
): Promise<NormalizedWikiPage | { error: string }> {
  try {
    const response = await redditApiRequest<RedditWikiPageResponse>(
      `/r/${encodeURIComponent(subredditName)}/wiki/${encodeURIComponent(pageName)}`,
    );

    const wikiData = response.data;

    return {
      page: pageName,
      content: truncateText(wikiData.content_md, 15_000),
      lastRevisionUtc: wikiData.revision_date || 0,
      revisedBy: wikiData.revision_by?.data?.name || "unknown",
    };
  } catch (error: unknown) {
    return {
      error: `Subreddit wiki page fetch failed: ${errorMessage(error)}`,
    };
  }
}

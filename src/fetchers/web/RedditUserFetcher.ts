// ─── Reddit User History Fetcher (OAuth2 + Rate-Limited) ────

import { redditApiRequest, delayBetweenRequests } from "./RedditClient.ts";
import { errorMessage } from "../../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────────

const MAX_ITEMS_PER_PAGE = 100;
const DEFAULT_ITEMS_PER_PAGE = 25;
const DEFAULT_MAX_PAGES = 10;
const MAX_BODY_CHARACTERS = 2_000;

type UserHistoryCategory = "overview" | "comments" | "submitted" | "gilded";

// ─── Response Interfaces ───────────────────────────────────────────

interface RedditListingResponse {
  kind: string;
  data: {
    after: string | null;
    before: string | null;
    children: RedditListingChild[];
  };
}

interface RedditListingChild {
  kind: string;
  data: Record<string, unknown>;
}

interface RedditUserAboutResponse {
  kind: string;
  data: {
    name: string;
    created_utc: number;
    link_karma: number;
    comment_karma: number;
    total_karma: number;
    is_gold: boolean;
    is_mod: boolean;
    has_verified_email: boolean;
    icon_img: string;
    subreddit?: {
      display_name_prefixed?: string;
      public_description?: string;
      subscribers?: number;
    };
    snoovatar_img?: string;
  };
}

// ─── Data Normalization ────────────────────────────────────────────

interface NormalizedComment {
  type: "comment";
  subreddit: string;
  postTitle: string;
  body: string;
  score: number;
  createdUtc: number;
  permalink: string;
  isEdited: boolean;
  awards: number;
}

interface NormalizedPost {
  type: "post";
  subreddit: string;
  title: string;
  selfText: string;
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

type NormalizedItem = NormalizedComment | NormalizedPost;

function truncateBody(text: string): string {
  if (!text || text.length <= MAX_BODY_CHARACTERS) return text || "";
  return text.slice(0, MAX_BODY_CHARACTERS) + "... [truncated]";
}

function normalizeListingChild(
  child: RedditListingChild,
): NormalizedItem | null {
  const childData = child.data;

  if (child.kind === "t1") {
    return {
      type: "comment",
      subreddit:
        (childData.subreddit_name_prefixed as string) ||
        `r/${childData.subreddit as string}`,
      postTitle: (childData.link_title as string) || "",
      body: truncateBody(childData.body as string),
      score: (childData.score as number) || 0,
      createdUtc: (childData.created_utc as number) || 0,
      permalink: `https://www.reddit.com${childData.permalink as string}`,
      isEdited: !!childData.edited,
      awards: (childData.total_awards_received as number) || 0,
    };
  }

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
      selfText: truncateBody(childData.selftext as string),
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

  return null;
}

// ─── Public API ────────────────────────────────────────────────────

interface RedditUserProfile {
  username: string;
  createdUtc: number;
  linkKarma: number;
  commentKarma: number;
  totalKarma: number;
  isGold: boolean;
  isModerator: boolean;
  hasVerifiedEmail: boolean;
  avatarUrl: string | null;
  profileDescription: string | null;
}

interface RedditUserHistoryOptions {
  category?: UserHistoryCategory;
  limit?: number;
  maxPages?: number;
  sort?: "new" | "hot" | "top" | "controversial";
  timeRange?: "hour" | "day" | "week" | "month" | "year" | "all";
}

interface RedditUserHistoryResult {
  profile: RedditUserProfile;
  items: NormalizedItem[];
  itemCount: number;
  category: UserHistoryCategory;
  hasMore: boolean;
  pagesRetrieved: number;
  requestsUsed: number;
}

export async function getRedditUserProfile(
  username: string,
): Promise<RedditUserProfile | { error: string }> {
  try {
    const aboutData = await redditApiRequest<RedditUserAboutResponse>(
      `/user/${encodeURIComponent(username)}/about`,
    );

    const userData = aboutData.data;

    return {
      username: userData.name,
      createdUtc: userData.created_utc,
      linkKarma: userData.link_karma,
      commentKarma: userData.comment_karma,
      totalKarma: userData.total_karma,
      isGold: userData.is_gold,
      isModerator: userData.is_mod,
      hasVerifiedEmail: userData.has_verified_email,
      avatarUrl: userData.snoovatar_img || userData.icon_img || null,
      profileDescription: userData.subreddit?.public_description || null,
    };
  } catch (error: unknown) {
    return {
      error: `Reddit user profile fetch failed: ${errorMessage(error)}`,
    };
  }
}

export async function getRedditUserHistory(
  username: string,
  options: RedditUserHistoryOptions = {},
): Promise<RedditUserHistoryResult | { error: string }> {
  const {
    category = "overview",
    limit = DEFAULT_ITEMS_PER_PAGE,
    maxPages = DEFAULT_MAX_PAGES,
    sort = "new",
    timeRange = "all",
  } = options;

  const validCategories: UserHistoryCategory[] = [
    "overview",
    "comments",
    "submitted",
    "gilded",
  ];
  if (!validCategories.includes(category)) {
    return {
      error: `Invalid category "${category}". Must be one of: ${validCategories.join(", ")}`,
    };
  }

  const effectiveItemsPerPage = Math.min(limit, MAX_ITEMS_PER_PAGE);
  const effectiveMaxPages = Math.min(maxPages, DEFAULT_MAX_PAGES);

  try {
    const parameters: Record<string, string> = {
      limit: effectiveItemsPerPage.toString(),
      sort,
      t: timeRange,
    };

    const [profileResult, firstPageResult] = await Promise.all([
      getRedditUserProfile(username),
      redditApiRequest<RedditListingResponse>(
        `/user/${encodeURIComponent(username)}/${category}`,
        parameters,
      ).catch((error: unknown) => ({ error: errorMessage(error) })),
    ]);

    let requestsUsed = 2; // 1 for profile, 1 for first page of history

    if ("error" in profileResult) {
      return profileResult;
    }

    if ("error" in firstPageResult) {
      return {
        error: `Reddit user history fetch failed: ${(firstPageResult as { error: string }).error}`,
      };
    }

    const firstPageListing = firstPageResult as RedditListingResponse;
    const allItems: NormalizedItem[] = [];
    let afterCursor: string | null = null;
    let pagesRetrieved = 0;
    let hasMore = false;

    pagesRetrieved++;
    const pageChildren = firstPageListing.data?.children || [];
    for (const child of pageChildren) {
      const normalizedItem = normalizeListingChild(child);
      if (normalizedItem) {
        allItems.push(normalizedItem);
      }
    }

    afterCursor = firstPageListing.data?.after || null;

    if (
      afterCursor &&
      pageChildren.length >= effectiveItemsPerPage &&
      allItems.length < limit
    ) {
      for (let pageIndex = 1; pageIndex < effectiveMaxPages; pageIndex++) {
        const nextParameters: Record<string, string> = {
          limit: effectiveItemsPerPage.toString(),
          sort,
          t: timeRange,
          after: afterCursor,
          count: allItems.length.toString(),
        };

        await delayBetweenRequests();

        const listing = await redditApiRequest<RedditListingResponse>(
          `/user/${encodeURIComponent(username)}/${category}`,
          nextParameters,
        );

        requestsUsed++;
        pagesRetrieved++;

        const nextPageChildren = listing.data?.children || [];
        for (const child of nextPageChildren) {
          const normalizedItem = normalizeListingChild(child);
          if (normalizedItem) {
            allItems.push(normalizedItem);
          }
        }

        afterCursor = listing.data?.after || null;

        if (!afterCursor || nextPageChildren.length < effectiveItemsPerPage) {
          hasMore = !!afterCursor;
          break;
        }

        if (allItems.length >= limit) {
          hasMore = true;
          break;
        }
      }
    } else {
      hasMore = !!afterCursor;
    }

    const trimmedItems = allItems.slice(0, limit);

    return {
      profile: profileResult,
      items: trimmedItems,
      itemCount: trimmedItems.length,
      category,
      hasMore: hasMore || allItems.length > limit,
      pagesRetrieved,
      requestsUsed,
    };
  } catch (error: unknown) {
    return {
      error: `Reddit user history fetch failed: ${errorMessage(error)}`,
    };
  }
}

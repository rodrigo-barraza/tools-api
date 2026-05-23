/**
 * Trend Fetcher TypeScript Definitions
 */

// ─── Common Trend Item (all fetchers produce this) ──────────────

export interface TrendItem {
  name: string;
  normalizedName: string;
  source: string;
  category?: string | null;
  volume?: number;
  url?: string | null;
  context?: Record<string, unknown>;
}

// ─── Reddit ─────────────────────────────────────────────────────

export interface RawRedditPost {
  data: {
    title: string;
    score: number;
    ups: number;
    num_comments: number;
    permalink: string;
    url: string;
    subreddit: string;
    stickied: boolean;
    author: string;
    upvote_ratio: number;
    link_flair_text: string | null;
    thumbnail: string | null;
    is_video: boolean;
    created_utc: number;
    [key: string]: unknown;
  };
}

export interface RawRedditListing {
  data: {
    children: RawRedditPost[];
  };
}

// ─── Google Trends ──────────────────────────────────────────────

export interface GoogleTrendEntry {
  title: string;
  traffic: string;
  newsTitle: string | null;
  newsSource: string | null;
  newsUrl: string | null;
  url: string | null;
}

// ─── Google News ────────────────────────────────────────────────

export interface GoogleNewsArticle {
  title: string;
  url: string | null;
  source: string | null;
  publishedAt: string | null;
  category: string;
  section: string;
}

// ─── Wikipedia ──────────────────────────────────────────────────

export interface RawWikipediaArticle {
  article: string;
  views: number;
  rank: number;
}

// ─── TVMaze ─────────────────────────────────────────────────────

export interface RawTVMazeScheduleEntry {
  id: number;
  name: string;
  season: number;
  number: number;
  runtime: number | null;
  rating: { average: number | null };
  show: {
    id: number;
    name: string;
    type: string;
    language: string | null;
    genres: string[];
    status: string;
    runtime: number | null;
    rating: { average: number | null };
    weight: number;
    network: { name: string; country: { code: string; name: string } | null } | null;
    webChannel: { name: string } | null;
    image: { medium: string | null; original: string | null } | null;
    url: string;
  };
  country?: string;
}

// ─── GitHub Trending ────────────────────────────────────────────

export interface GitHubTrendingRepo {
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  starsToday: number;
  url: string;
}

// ─── Product Hunt ───────────────────────────────────────────────

export interface RawProductHuntPost {
  id: string;
  name: string;
  tagline: string;
  votesCount: number;
  commentsCount: number;
  topics?: Array<{ name?: string } | string>;
  url: string;
  thumbnail?: { url?: string } | null;
}

// ─── Hacker News ────────────────────────────────────────────────

export interface HackerNewsItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  descendants?: number;
  type: string;
  time: number;
}

// ─── X / Twitter Trends ────────────────────────────────────────

export interface RawXTrend {
  name: string;
  url: string;
  tweet_volume: number | null;
}

export interface XTrendResponse {
  trends: RawXTrend[];
}

// ─── Bluesky ────────────────────────────────────────────────────

export interface RawBlueskyFeedItem {
  post: {
    uri: string;
    author: {
      handle: string;
      displayName?: string;
    };
    record: {
      text: string;
      createdAt: string;
    };
    likeCount?: number;
    repostCount?: number;
    replyCount?: number;
  };
}

// ─── Mastodon ───────────────────────────────────────────────────

export interface RawMastodonTag {
  name: string;
  url: string;
  history: Array<{
    day: string;
    uses: string;
    accounts: string;
  }>;
}

export interface RawMastodonStatus {
  id: string;
  content: string;
  url: string;
  created_at: string;
  account: {
    username: string;
    display_name: string;
  };
  favourites_count: number;
  reblogs_count: number;
  replies_count: number;
}

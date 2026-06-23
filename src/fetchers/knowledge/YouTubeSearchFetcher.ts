// ─── YouTube Search via Data API v3 ─────────────────────────

import CONFIG from "../../config.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────────

const YOUTUBE_SEARCH_API_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_API_URL = "https://www.googleapis.com/youtube/v3/videos";
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

// ─── Types ─────────────────────────────────────────────────────────

export interface YouTubeSearchOptions {
  limit?: number;
  order?: "relevance" | "date" | "rating" | "viewCount" | "title";
  channelId?: string;
  publishedAfter?: string;
  publishedBefore?: string;
  videoDuration?: "any" | "short" | "medium" | "long";
  safeSearch?: "moderate" | "strict" | "none";
  regionCode?: string;
  relevanceLanguage?: string;
}

export interface YouTubeSearchResult {
  videoId: string;
  url: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  duration: string | null;
  durationSeconds: number | null;
}

export interface YouTubeSearchResponse {
  query: string;
  totalResults: number;
  resultsPerPage: number;
  results: YouTubeSearchResult[];
}

// ─── ISO 8601 Duration Parser ──────────────────────────────────────

function parseIsoDuration(isoDuration: string | null | undefined): number | null {
  if (!isoDuration) return null;
  const match = isoDuration.match(
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/,
  );
  if (!match) return null;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// ─── Raw API Response Types ────────────────────────────────────────

interface YouTubeSearchApiItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface YouTubeSearchApiResponse {
  pageInfo?: {
    totalResults?: number;
    resultsPerPage?: number;
  };
  items?: YouTubeSearchApiItem[];
  error?: {
    message?: string;
    code?: number;
  };
}

interface YouTubeVideoApiItem {
  id?: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

interface YouTubeVideosApiResponse {
  items?: YouTubeVideoApiItem[];
  error?: {
    message?: string;
    code?: number;
  };
}

// ─── API Helpers ───────────────────────────────────────────────────

async function fetchSearchResults(
  query: string,
  options: YouTubeSearchOptions,
  apiKey: string,
): Promise<YouTubeSearchApiResponse> {
  const searchParameters = new URLSearchParams({
    part: "snippet",
    type: "video",
    key: apiKey,
    q: query,
    maxResults: String(Math.min(options.limit || 10, 25)),
  });

  if (options.order) searchParameters.set("order", options.order);
  if (options.channelId) searchParameters.set("channelId", options.channelId);
  if (options.publishedAfter) searchParameters.set("publishedAfter", options.publishedAfter);
  if (options.publishedBefore) searchParameters.set("publishedBefore", options.publishedBefore);
  if (options.videoDuration && options.videoDuration !== "any") {
    searchParameters.set("videoDuration", options.videoDuration);
  }
  if (options.safeSearch) searchParameters.set("safeSearch", options.safeSearch);
  if (options.regionCode) searchParameters.set("regionCode", options.regionCode);
  if (options.relevanceLanguage) searchParameters.set("relevanceLanguage", options.relevanceLanguage);

  const response = await fetch(`${YOUTUBE_SEARCH_API_URL}?${searchParameters.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });

  return response.json() as Promise<YouTubeSearchApiResponse>;
}

async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, YouTubeVideoApiItem>> {
  if (videoIds.length === 0) return new Map();

  const detailParameters = new URLSearchParams({
    part: "statistics,contentDetails",
    key: apiKey,
    id: videoIds.join(","),
  });

  const response = await fetch(`${YOUTUBE_VIDEOS_API_URL}?${detailParameters.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });

  const data = (await response.json()) as YouTubeVideosApiResponse;

  if (data.error) {
    logger.warn(
      `[YouTubeSearchFetcher] videos.list enrichment failed: ${data.error.message}`,
    );
    return new Map();
  }

  const detailMap = new Map<string, YouTubeVideoApiItem>();
  for (const item of data.items || []) {
    if (item.id) {
      detailMap.set(item.id, item);
    }
  }
  return detailMap;
}

// ─── Public API ────────────────────────────────────────────────────

export async function searchYouTubeVideos(
  query: string,
  options: YouTubeSearchOptions = {},
): Promise<YouTubeSearchResponse | { error: string }> {
  const apiKey = CONFIG.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { error: "GOOGLE_PLACES_API_KEY is not configured — required for YouTube Data API v3" };
  }

  try {
    logger.info(
      `[YouTubeSearchFetcher] Searching: "${query}" (limit=${options.limit || 10}, order=${options.order || "relevance"})`,
    );

    const searchData = await fetchSearchResults(query, options, apiKey);

    if (searchData.error) {
      const errorDescription = searchData.error.message || `API error ${searchData.error.code}`;
      logger.error(`[YouTubeSearchFetcher] API error: ${errorDescription}`);
      return { error: `YouTube search failed: ${errorDescription}` };
    }

    const searchItems = searchData.items || [];
    const videoIds = searchItems
      .map((item) => item.id?.videoId)
      .filter((identifer): identifer is string => Boolean(identifer));

    // Enrich with statistics + duration via a single batch call (costs 1 unit)
    const videoDetailMap = await fetchVideoDetails(videoIds, apiKey);

    const results: YouTubeSearchResult[] = searchItems
      .filter((item) => item.id?.videoId)
      .map((item) => {
        const videoId = item.id!.videoId!;
        const snippet = item.snippet || {};
        const details = videoDetailMap.get(videoId);
        const statistics = details?.statistics;
        const contentDetails = details?.contentDetails;

        const thumbnailUrl =
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          null;

        const isoDuration = contentDetails?.duration || null;

        return {
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: snippet.title || "",
          description: snippet.description || "",
          channelTitle: snippet.channelTitle || "",
          channelId: snippet.channelId || "",
          publishedAt: snippet.publishedAt || "",
          thumbnailUrl,
          viewCount: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : null,
          likeCount: statistics?.likeCount ? parseInt(statistics.likeCount, 10) : null,
          commentCount: statistics?.commentCount ? parseInt(statistics.commentCount, 10) : null,
          duration: isoDuration,
          durationSeconds: parseIsoDuration(isoDuration),
        };
      });

    logger.info(
      `[YouTubeSearchFetcher] Found ${results.length} results for "${query}"`,
    );

    return {
      query,
      totalResults: searchData.pageInfo?.totalResults || results.length,
      resultsPerPage: searchData.pageInfo?.resultsPerPage || results.length,
      results,
    };
  } catch (error: unknown) {
    logger.error(
      `[YouTubeSearchFetcher] Search failed: ${errorMessage(error)}`,
    );
    return { error: `YouTube search failed: ${errorMessage(error)}` };
  }
}

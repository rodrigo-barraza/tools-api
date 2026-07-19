// ─── Shared Reddit OAuth2 Client + Rate Limiter ────────────

import logger from "../../logger.ts";
import { sleep } from "@rodrigo-barraza/utilities-library";
import { createTtlCache } from "@rodrigo-barraza/utilities-library/cache";
import {
  redditTokenManager,
  redditRequestHeaders,
} from "../shared/RedditAuth.ts";

// ─── Constants ─────────────────────────────────────────────────────

const OAUTH_API_BASE = "https://oauth.reddit.com";

/**
 * Reddit enforces 100 QPM (queries per minute) for authenticated OAuth apps.
 * Sliding-window token bucket stays well under this limit.
 * Target: ~80 QPM max burst, averaged over a rolling 60-second window.
 */
const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 80;

// ─── Rate Limiter (Sliding Window) ─────────────────────────────────

const requestTimestamps: number[] = [];
let rateLimitQueuePromise: Promise<void> = Promise.resolve();

function pruneExpiredTimestamps(): void {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MILLISECONDS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

async function waitForRateLimit(): Promise<void> {
  const currentPromise = rateLimitQueuePromise;
  let resolveQueue: () => void = () => {};
  rateLimitQueuePromise = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });

  await currentPromise;

  try {
    pruneExpiredTimestamps();

    if (requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      const oldestTimestamp = requestTimestamps[0];
      const waitDuration =
        oldestTimestamp + RATE_LIMIT_WINDOW_MILLISECONDS - Date.now();
      if (waitDuration > 0) {
        logger.warn(
          "Reddit rate limiter: throttling for %dms (%d/%d requests in window)",
          waitDuration,
          requestTimestamps.length,
          RATE_LIMIT_MAX_REQUESTS,
        );
        await sleep(waitDuration);
        pruneExpiredTimestamps();
      }
    }

    requestTimestamps.push(Date.now());
  } finally {
    resolveQueue();
  }
}

// ─── Cache Layer ───────────────────────────────────────────────────

const apiCache = createTtlCache();
const CACHE_TTL_MILLISECONDS = 120_000; // 2 minutes

// ─── Public: Authenticated API Request ─────────────────────────────

export async function redditApiRequest<T>(
  endpoint: string,
  parameters: Record<string, string> = {},
  bypassCache = false,
): Promise<T> {
  if (bypassCache) return fetchFromRedditApi<T>(endpoint, parameters);

  const cacheKey = `${endpoint}?${new URLSearchParams(parameters).toString()}`;
  return apiCache.get<T>(cacheKey, CACHE_TTL_MILLISECONDS, () =>
    fetchFromRedditApi<T>(endpoint, parameters),
  );
}

async function fetchFromRedditApi<T>(
  endpoint: string,
  parameters: Record<string, string>,
): Promise<T> {
  await waitForRateLimit();

  const token = await redditTokenManager.getToken();
  const queryString = new URLSearchParams({
    ...parameters,
    raw_json: "1",
  }).toString();

  const url = `${OAUTH_API_BASE}${endpoint}?${queryString}`;

  const response = await fetch(url, {
    headers: redditRequestHeaders(token),
  });

  if (response.status === 404) {
    throw new Error("Reddit resource not found (404)");
  }
  if (response.status === 403) {
    throw new Error("Reddit resource is private or access denied (403)");
  }
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retrySeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
    throw new Error(
      `Reddit rate limit exceeded (retry after ${retrySeconds}s)`,
    );
  }
  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status}`);
  }

  return (await response.json()) as T;
}

// ─── Public: Inter-Request Delay Helper ────────────────────────────

/**
 * Delay between paginated requests to stay comfortably under rate limits.
 * Call this between pages when making sequential requests.
 */
export const INTER_REQUEST_DELAY_MILLISECONDS = 750;

export async function delayBetweenRequests(): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, INTER_REQUEST_DELAY_MILLISECONDS),
  );
}

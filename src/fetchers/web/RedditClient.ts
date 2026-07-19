// ─── Shared Reddit OAuth2 Client + Rate Limiter ────────────

import CONFIG from "../../config.ts";
import { USER_AGENT } from "../../constants.ts";
import logger from "../../logger.ts";
import { sleep } from "@rodrigo-barraza/utilities-library";
import { TokenManager } from "@rodrigo-barraza/utilities-library/node";

// ─── Constants ─────────────────────────────────────────────────────

const OAUTH_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const OAUTH_API_BASE = "https://oauth.reddit.com";

const TOKEN_REFRESH_BUFFER_SECONDS = 300;

/**
 * Reddit enforces 100 QPM (queries per minute) for authenticated OAuth apps.
 * Sliding-window token bucket stays well under this limit.
 * Target: ~80 QPM max burst, averaged over a rolling 60-second window.
 */
const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 80;

// ─── OAuth2 Token Manager (Client Credentials Grant) ──────────────

export function buildUserAgent(): string {
  return CONFIG.REDDIT_USER_AGENT || USER_AGENT;
}

// Token expiry is shortened by the refresh buffer so a fresh token is
// acquired TOKEN_REFRESH_BUFFER_SECONDS before Reddit's actual expiry —
// same semantics as the previous hand-rolled cachedToken check.
const redditTokenManager = new TokenManager(async () => {
  const clientId = CONFIG.REDDIT_CLIENT_ID;
  const clientSecret = CONFIG.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Reddit OAuth2 credentials not configured (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET)",
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": buildUserAgent(),
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Reddit OAuth2 token request failed: ${response.status}`);
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  logger.info(
    "Reddit OAuth2 token acquired (expires in %ds)",
    tokenData.expires_in,
  );

  return {
    token: tokenData.access_token,
    expiresInMilliseconds:
      tokenData.expires_in * 1_000 - TOKEN_REFRESH_BUFFER_SECONDS * 1_000,
  };
});

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

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MILLISECONDS = 120_000; // 2 minutes

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of apiCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MILLISECONDS) {
      apiCache.delete(key);
    }
  }
}

// ─── Public: Authenticated API Request ─────────────────────────────

export async function redditApiRequest<T>(
  endpoint: string,
  parameters: Record<string, string> = {},
  bypassCache = false,
): Promise<T> {
  const cacheKey = `${endpoint}?${new URLSearchParams(parameters).toString()}`;

  if (!bypassCache) {
    pruneCache();
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MILLISECONDS) {
      return cached.data as T;
    }
  }

  await waitForRateLimit();

  const token = await redditTokenManager.getToken();
  const queryString = new URLSearchParams({
    ...parameters,
    raw_json: "1",
  }).toString();

  const url = `${OAUTH_API_BASE}${endpoint}?${queryString}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": buildUserAgent(),
    },
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

  const result = (await response.json()) as T;

  if (!bypassCache) {
    apiCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });
  }

  return result;
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

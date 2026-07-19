// ─── Shared Reddit OAuth2 Auth (Client Credentials Grant) ──────────
//
// Single token manager + request headers shared by the trend fetcher
// (RedditFetcher) and the web client (RedditClient).

import { TokenManager } from "@rodrigo-barraza/utilities-library/node";
import CONFIG from "../../config.ts";
import { USER_AGENT } from "../../constants.ts";
import logger from "../../logger.ts";

const OAUTH_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

const TOKEN_REFRESH_BUFFER_SECONDS = 300;

export function buildUserAgent(): string {
  return CONFIG.REDDIT_USER_AGENT || USER_AGENT;
}

// Token expiry is shortened by the refresh buffer so a fresh token is
// acquired TOKEN_REFRESH_BUFFER_SECONDS before Reddit's actual expiry.
export const redditTokenManager = new TokenManager(async () => {
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

/** Authenticated request headers for oauth.reddit.com calls. */
export function redditRequestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": buildUserAgent(),
  };
}

// ─── Classifieds Engine — Shared Archive-First Scrape Flow ──────
//
// Generic version of the Craigslist tool's traffic contract, reused
// by every scraped classifieds source (kijiji, autotrader, …):
//
//   • MongoDB archive is the source of truth — every response is
//     served from the archive; the source site is only a refresh
//     source consulted at most once per freshness window per search.
//   • Per-source global daily budget + serialized jittered pacing +
//     persistent circuit breaker on any block response.
//   • from/to date queries never fetch — archive only.
//
// Each source supplies a URL builder and an HTML parser; everything
// else (governor, cache, archive, response shape) lives here.

import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import {
  getOrCreateClassifiedsSearch,
  recordClassifiedsSearchFetch,
  upsertClassifiedListings,
  markMissingClassifiedListings,
  getClassifiedListingsForSearch,
  countNewClassifiedListingsSince,
  getClassifiedsGovernorState,
  tryConsumeClassifiedsBudget,
  tripClassifiedsBreaker,
  resetClassifiedsBreaker,
  type ParsedClassifiedListing,
  type ClassifiedListingDocument,
} from "../../models/ClassifiedsArchive.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 20_000;

export interface ClassifiedsSourceConfig {
  /** Source key, e.g. "kijiji" — used for governor + archive rows */
  source: string;
  /** RateLimiterService provider key, e.g. "KIJIJI" */
  provider: string;
  /** Hard global cap on requests per UTC day */
  dailyBudget: number;
  /** Serve archive without fetching if last fetch is younger */
  freshnessTtlMs: number;
  /** Max queued fetches before refusing outright */
  maxPending: number;
  /** Extra random delay on top of the rate limiter's fixed spacing */
  jitterMaxMs: number;
  /** Body pattern that indicates a block page despite HTTP 200 */
  blockedPattern?: RegExp;
  /** Build the search-results URL for a normalized site/section/query */
  buildUrl: (site: string, section: string, query: string) => string;
  /** Extract listings from the fetched HTML */
  parse: (html: string) => ParsedClassifiedListing[];
}

export interface ClassifiedsSearchOptions {
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface ClassifiedListingView {
  postId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrls: string[];
  postedAt: string | null;
  description: string | null;
  attributes: Record<string, string | number | null>;
  firstSeenAt: string;
  lastSeenAt: string;
  missingSince: string | null;
}

export interface ClassifiedsSearchResponse {
  source: string;
  searchKey: string;
  site: string;
  category: string;
  query: string;
  listings: ClassifiedListingView[];
  totalArchived: number;
  newSinceLastCall: number;
  fromCache: boolean;
  archiveOnly: boolean;
  stale: boolean;
  staleReason: string | null;
  lastFetchedAt: string | null;
  budgetRemainingToday: number;
}

function toView(document: ClassifiedListingDocument): ClassifiedListingView {
  return {
    postId: document.postId,
    url: document.url,
    title: document.title,
    price: document.price,
    currency: document.currency,
    location: document.location,
    latitude: document.latitude ?? null,
    longitude: document.longitude ?? null,
    imageUrls: document.imageUrls ?? [],
    postedAt: document.postedAt
      ? new Date(document.postedAt).toISOString()
      : null,
    description: document.description,
    attributes: document.attributes ?? {},
    firstSeenAt: new Date(document.firstSeenAt).toISOString(),
    lastSeenAt: new Date(document.lastSeenAt).toISOString(),
    missingSince: document.missingSince
      ? new Date(document.missingSince).toISOString()
      : null,
  };
}

interface GovernedFetchResult {
  html?: string;
  status: number;
  blocked?: boolean;
  error?: string;
  refused?: "breaker" | "budget" | "queue";
}

export interface ClassifiedsSource {
  search: (
    site: string,
    section: string,
    categoryLabel: string,
    query: string,
    options?: ClassifiedsSearchOptions,
  ) => Promise<ClassifiedsSearchResponse | { error: string }>;
}

export function createClassifiedsSource(
  config: ClassifiedsSourceConfig,
): ClassifiedsSource {
  let pendingFetches = 0;

  async function fetchPage(url: string): Promise<GovernedFetchResult> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.status === 403 || response.status === 429) {
        return { status: response.status, blocked: true };
      }
      if (!response.ok) {
        return { status: response.status, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      if (config.blockedPattern && config.blockedPattern.test(html)) {
        return { status: response.status, blocked: true };
      }
      return { status: response.status, html };
    } catch (error: unknown) {
      return { status: 0, error: errorMessage(error) };
    }
  }

  async function governedFetch(url: string): Promise<GovernedFetchResult> {
    if (pendingFetches >= config.maxPending) {
      return { status: 0, refused: "queue" };
    }

    const state = await getClassifiedsGovernorState(config.source);
    if (state.breakerUntil && new Date(state.breakerUntil) > new Date()) {
      return { status: 0, refused: "breaker" };
    }

    if (
      !(await tryConsumeClassifiedsBudget(config.source, 1, config.dailyBudget))
    ) {
      return { status: 0, refused: "budget" };
    }

    pendingFetches += 1;
    try {
      await rateLimiter.wait(config.provider);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.random() * config.jitterMaxMs),
      );

      const result = await fetchPage(url);

      if (result.blocked) {
        await tripClassifiedsBreaker(config.source);
      } else if (result.html) {
        await resetClassifiedsBreaker(config.source);
      }
      return result;
    } finally {
      pendingFetches -= 1;
    }
  }

  async function search(
    site: string,
    section: string,
    categoryLabel: string,
    query: string,
    { from, to, limit = 50 }: ClassifiedsSearchOptions = {},
  ): Promise<ClassifiedsSearchResponse | { error: string }> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return { error: "Query is required" };

    const searchKey = `${config.source}|${site}|${section}|${trimmedQuery.toLowerCase()}`;
    const search = await getOrCreateClassifiedsSearch(
      config.source,
      searchKey,
      site,
      section,
      trimmedQuery,
    );
    const governorState = await getClassifiedsGovernorState(config.source);
    const budgetRemaining = Math.max(
      0,
      config.dailyBudget - governorState.used,
    );

    const baseResponse = {
      source: config.source,
      searchKey,
      site,
      category: categoryLabel,
      query: trimmedQuery,
    };

    // ── Archive-only mode: date-range queries never fetch ──
    if (from || to) {
      const archived = await getClassifiedListingsForSearch(searchKey, {
        from,
        to,
        limit,
      });
      return {
        ...baseResponse,
        listings: archived.map(toView),
        totalArchived: archived.length,
        newSinceLastCall: 0,
        fromCache: true,
        archiveOnly: true,
        stale: false,
        staleReason: null,
        lastFetchedAt: search?.lastFetchedAt
          ? new Date(search.lastFetchedAt).toISOString()
          : null,
        budgetRemainingToday: budgetRemaining,
      };
    }

    // ── Freshness gate ──
    const lastFetchedAt = search?.lastFetchedAt
      ? new Date(search.lastFetchedAt)
      : null;
    const isFresh =
      lastFetchedAt !== null &&
      Date.now() - lastFetchedAt.getTime() < config.freshnessTtlMs;

    let fromCache = true;
    let stale = false;
    let staleReason: string | null = null;
    const callStartedAt = new Date();

    if (!isFresh) {
      const url = config.buildUrl(site, section, trimmedQuery);
      const result = await governedFetch(url);

      if (result.html) {
        let parsed: ParsedClassifiedListing[] = [];
        try {
          parsed = config.parse(result.html);
        } catch (error: unknown) {
          logger.error(
            `[${config.source}] Parse failed for ${searchKey}: ${errorMessage(error)}`,
          );
        }
        await upsertClassifiedListings(
          config.source,
          searchKey,
          site,
          section,
          parsed,
        );
        await markMissingClassifiedListings(
          config.source,
          searchKey,
          parsed.map((p) => p.postId),
        );
        await recordClassifiedsSearchFetch(searchKey, parsed.length);
        fromCache = false;
        logger.info(
          `[${config.source}] 🔎 Fetched ${searchKey} — ${parsed.length} listings`,
        );
      } else if (result.status === 404) {
        return {
          error: `Search page not found on ${config.source} for site '${site}' — the city may not be supported.`,
        };
      } else {
        stale = true;
        staleReason = result.refused
          ? {
              breaker: `${config.source} blocked a recent request; fetching is paused for a cooldown period and archived data is served instead.`,
              budget: `Daily ${config.source} request budget is exhausted; archived data is served until the budget resets (UTC midnight).`,
              queue: `Too many ${config.source} searches are waiting to refresh; archived data is served — retry later for fresh results.`,
            }[result.refused]
          : `Fetch failed (${result.error ?? `HTTP ${result.status}`}); archived data is served.`;
      }
    }

    const archived = await getClassifiedListingsForSearch(searchKey, { limit });
    const newSinceLastCall = fromCache
      ? 0
      : await countNewClassifiedListingsSince(searchKey, callStartedAt);
    const finalGovernor = await getClassifiedsGovernorState(config.source);

    return {
      ...baseResponse,
      listings: archived.map(toView),
      totalArchived: archived.length,
      newSinceLastCall,
      fromCache,
      archiveOnly: false,
      stale,
      staleReason,
      lastFetchedAt: fromCache
        ? search?.lastFetchedAt
          ? new Date(search.lastFetchedAt).toISOString()
          : null
        : callStartedAt.toISOString(),
      budgetRemainingToday: Math.max(
        0,
        config.dailyBudget - finalGovernor.used,
      ),
    };
  }

  return { search };
}

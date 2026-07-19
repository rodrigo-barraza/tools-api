// ─── Craigslist Fetcher — Archive-First Classifieds Search ──────
//
// Craigslist has no API; this fetcher scrapes the server-rendered
// static search results (the `cl-static-search-result` fallback list
// served to all clients) at a strictly governed rate:
//
//   • MongoDB archive is the source of truth — every response is
//     served from the archive; Craigslist is only a refresh source.
//   • Freshness TTL per search key — repeated calls within the TTL
//     serve cached data and make zero outbound requests.
//   • Global daily request budget + serialized jittered pacing +
//     persistent circuit breaker on any block response (403 = stop
//     sign: cool down for hours, never retry).
//   • from/to date queries never fetch — archive only.

import { toAlphanumeric } from "@rodrigo-barraza/utilities-library";
import * as cheerio from "cheerio";
import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import {
  getOrCreateSearch,
  recordSearchFetch,
  upsertListings,
  markMissingListings,
  getListingsForSearch,
  countNewListingsSince,
  getGovernorState,
  tryConsumeBudget,
  tripBreaker,
  resetBreaker,
  type ParsedListing,
  type CraigslistListingDocument,
} from "../../models/CraigslistListing.ts";

// ─── Tunables ────────────────────────────────────────────────────

/** Serve archive without fetching if last fetch is younger than this */
const FRESHNESS_TTL_MS = 45 * 60_000;
/** Hard global cap on Craigslist requests per UTC day */
const DAILY_REQUEST_BUDGET = 200;
/** Max callers waiting on the fetch queue before rejecting outright */
const MAX_PENDING_FETCHES = 10;
/** Extra random delay on top of the rate limiter's fixed spacing */
const JITTER_MAX_MS = 5_000;
const FETCH_TIMEOUT_MS = 20_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── Category & City Mapping ─────────────────────────────────────

export const CRAIGSLIST_CATEGORIES: Record<string, string> = {
  "for sale": "sss",
  jobs: "jjj",
  housing: "hhh",
  services: "bbb",
  gigs: "ggg",
  autos: "cta",
};

const SECTION_CODES = new Set(Object.values(CRAIGSLIST_CATEGORIES));

/**
 * City aliases where the Craigslist subdomain isn't just the city name
 * with spaces removed. Everything else falls through to normalization.
 */
const CITY_ALIASES: Record<string, string> = {
  sanfrancisco: "sfbay",
  bayarea: "sfbay",
  sf: "sfbay",
  newyork: "newyork",
  nyc: "newyork",
  losangeles: "losangeles",
  la: "losangeles",
  washingtondc: "washingtondc",
  dc: "washingtondc",
  saltlakecity: "saltlakecity",
  slc: "saltlakecity",
  kansascity: "kansascity",
  neworleans: "neworleans",
  lasvegas: "lasvegas",
  vegas: "lasvegas",
  sandiego: "sandiego",
  sanantonio: "sanantonio",
  sanjose: "sfbay",
  stlouis: "stlouis",
  saintlouis: "stlouis",
  twincities: "minneapolis",
  saintpaul: "minneapolis",
  stpaul: "minneapolis",
  minneapolis: "minneapolis",
  fortworth: "dallas",
  dallasfortworth: "dallas",
  dfw: "dallas",
  quebeccity: "quebec",
  montreal: "montreal",
  mtl: "montreal",
};

function normalizeCity(input: string): string {
  const normalized = toAlphanumeric(input);
  return CITY_ALIASES[normalized] ?? normalized;
}

function resolveSection(input: string): string | null {
  const normalized = input.toLowerCase().trim();
  if (CRAIGSLIST_CATEGORIES[normalized]) {
    return CRAIGSLIST_CATEGORIES[normalized];
  }
  if (SECTION_CODES.has(normalized)) return normalized;
  return null;
}

// ─── HTTP ────────────────────────────────────────────────────────

interface FetchPageResult {
  html?: string;
  status: number;
  blocked?: boolean;
  error?: string;
}

async function fetchPage(url: string): Promise<FetchPageResult> {
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
    if (/automatically blocked|blocked.{0,40}unusual activity/i.test(html)) {
      return { status: response.status, blocked: true };
    }
    return { status: response.status, html };
  } catch (error: unknown) {
    return { status: 0, error: errorMessage(error) };
  }
}

// ─── Parsers ─────────────────────────────────────────────────────

function parsePrice(text: string): number | null {
  const match = text.replace(/[,\s]/g, "").match(/\$?(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

/**
 * Parse the server-rendered static results list. Enriches with the
 * page's JSON-LD block (geo, currency, image) where titles match.
 */
export function parseSearchPage(html: string): ParsedListing[] {
  const $ = cheerio.load(html);

  // Optional JSON-LD enrichment: title → {currency, lat, lon, image}
  const enrichment = new Map<
    string,
    { currency: string | null; latitude: number | null; longitude: number | null; imageUrls: string[] }
  >();
  const ldJson = $("#ld_searchpage_results").text();
  if (ldJson) {
    try {
      const parsed = JSON.parse(ldJson) as {
        itemListElement?: {
          item?: {
            name?: string;
            image?: string[];
            offers?: {
              priceCurrency?: string;
              availableAtOrFrom?: {
                geo?: { latitude?: number; longitude?: number };
              };
            };
          };
        }[];
      };
      for (const element of parsed.itemListElement ?? []) {
        const item = element.item;
        if (!item?.name || enrichment.has(item.name)) continue;
        enrichment.set(item.name, {
          currency: item.offers?.priceCurrency ?? null,
          latitude: item.offers?.availableAtOrFrom?.geo?.latitude ?? null,
          longitude: item.offers?.availableAtOrFrom?.geo?.longitude ?? null,
          imageUrls: item.image ?? [],
        });
      }
    } catch {
      // JSON-LD is best-effort enrichment only
    }
  }

  const results: ParsedListing[] = [];
  const seen = new Set<string>();

  $("li.cl-static-search-result").each((_index, element) => {
    const item = $(element);
    const anchor = item.find("a").first();
    const url = anchor.attr("href")?.trim();
    const title =
      item.attr("title")?.trim() || item.find(".title").first().text().trim();
    if (!url || !title) return;

    // Post ID = trailing URL path token, stable and unique per post
    const postId = url.split("/").filter(Boolean).pop() ?? "";
    if (!postId || seen.has(postId)) return;
    seen.add(postId);

    const priceText = item.find(".price").first().text().trim();
    const location = item.find(".location").first().text().trim() || null;
    const extra = enrichment.get(title);

    results.push({
      postId,
      url,
      title,
      price: priceText ? parsePrice(priceText) : null,
      currency: extra?.currency ?? null,
      location,
      latitude: extra?.latitude ?? null,
      longitude: extra?.longitude ?? null,
      imageUrls: extra?.imageUrls ?? [],
    });
  });

  return results;
}

// ─── Governed Fetch ──────────────────────────────────────────────

let pendingFetches = 0;

interface GovernedFetchResult extends FetchPageResult {
  refused?: "breaker" | "budget" | "queue";
}

/**
 * All outbound Craigslist traffic funnels through here:
 * queue-depth check → breaker check → budget consumption →
 * serialized pacing with jitter → fetch → breaker bookkeeping.
 */
async function governedFetch(url: string): Promise<GovernedFetchResult> {
  if (pendingFetches >= MAX_PENDING_FETCHES) {
    return { status: 0, refused: "queue" };
  }

  const state = await getGovernorState();
  if (state.breakerUntil && new Date(state.breakerUntil) > new Date()) {
    return { status: 0, refused: "breaker" };
  }

  if (!(await tryConsumeBudget(1, DAILY_REQUEST_BUDGET))) {
    return { status: 0, refused: "budget" };
  }

  pendingFetches += 1;
  try {
    await rateLimiter.wait("CRAIGSLIST");
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.random() * JITTER_MAX_MS),
    );

    const result = await fetchPage(url);

    if (result.blocked) {
      await tripBreaker();
    } else if (result.html) {
      await resetBreaker();
    }
    return result;
  } finally {
    pendingFetches -= 1;
  }
}

// ─── Public API ──────────────────────────────────────────────────

export interface CraigslistSearchOptions {
  from?: Date;
  to?: Date;
  limit?: number;
}

interface ListingView {
  postId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrls: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  missingSince: string | null;
}

export interface CraigslistSearchResponse {
  searchKey: string;
  site: string;
  category: string;
  query: string;
  listings: ListingView[];
  totalArchived: number;
  newSinceLastCall: number;
  fromCache: boolean;
  archiveOnly: boolean;
  stale: boolean;
  staleReason: string | null;
  lastFetchedAt: string | null;
  budgetRemainingToday: number;
}

function toView(document: CraigslistListingDocument): ListingView {
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
    firstSeenAt: new Date(document.firstSeenAt).toISOString(),
    lastSeenAt: new Date(document.lastSeenAt).toISOString(),
    missingSince: document.missingSince
      ? new Date(document.missingSince).toISOString()
      : null,
  };
}

/**
 * Archive-first Craigslist search. See module header for the traffic
 * contract; callers can never trigger more than one search fetch per
 * search key per freshness window.
 */
export async function searchCraigslist(
  cityInput: string,
  categoryInput: string,
  query: string,
  { from, to, limit = 50 }: CraigslistSearchOptions = {},
): Promise<CraigslistSearchResponse | { error: string }> {
  const section = resolveSection(categoryInput);
  if (!section) {
    return {
      error: `Unknown category '${categoryInput}'. Use one of: ${Object.keys(CRAIGSLIST_CATEGORIES).join(", ")}`,
    };
  }
  const site = normalizeCity(cityInput);
  if (!site) return { error: "City is required" };
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return { error: "Query is required" };

  const searchKey = `${site}|${section}|${trimmedQuery.toLowerCase()}`;
  const search = await getOrCreateSearch(searchKey, site, section, trimmedQuery);
  const governorState = await getGovernorState();
  const budgetRemaining = Math.max(0, DAILY_REQUEST_BUDGET - governorState.used);

  const baseResponse = {
    searchKey,
    site,
    category: categoryInput,
    query: trimmedQuery,
  };

  // ── Archive-only mode: date-range queries never touch Craigslist ──
  if (from || to) {
    const archived = await getListingsForSearch(searchKey, { from, to, limit });
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

  // ── Freshness gate: within TTL → archive only, zero requests ──
  const lastFetchedAt = search?.lastFetchedAt
    ? new Date(search.lastFetchedAt)
    : null;
  const isFresh =
    lastFetchedAt !== null &&
    Date.now() - lastFetchedAt.getTime() < FRESHNESS_TTL_MS;

  let fromCache = true;
  let stale = false;
  let staleReason: string | null = null;
  const callStartedAt = new Date();

  if (!isFresh) {
    const url =
      `https://www.craigslist.org/search/area/${encodeURIComponent(site)}` +
      `?cat=${section}&query=${encodeURIComponent(trimmedQuery)}&sort=date`;
    const result = await governedFetch(url);

    if (result.html) {
      const parsed = parseSearchPage(result.html);
      await upsertListings(searchKey, site, section, parsed);
      await markMissingListings(searchKey, parsed.map((p) => p.postId));
      await recordSearchFetch(searchKey, parsed.length);
      fromCache = false;
      logger.info(
        `[Craigslist] 🔎 Fetched ${searchKey} — ${parsed.length} listings`,
      );
    } else if (result.status === 404) {
      return {
        error: `Unknown Craigslist city '${cityInput}' (tried '${site}'). Use the city's craigslist subdomain, e.g. 'sfbay' for the Bay Area.`,
      };
    } else {
      stale = true;
      staleReason = result.refused
        ? {
            breaker:
              "Craigslist blocked a recent request; fetching is paused for a cooldown period and archived data is served instead.",
            budget:
              "Daily Craigslist request budget is exhausted; archived data is served until the budget resets (UTC midnight).",
            queue:
              "Too many searches are waiting to refresh; archived data is served — retry later for fresh results.",
          }[result.refused]
        : `Fetch failed (${result.error ?? `HTTP ${result.status}`}); archived data is served.`;
    }
  }

  const archived = await getListingsForSearch(searchKey, { limit });
  const newSinceLastCall = fromCache
    ? 0
    : await countNewListingsSince(searchKey, callStartedAt);
  const finalGovernor = await getGovernorState();

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
      DAILY_REQUEST_BUDGET - finalGovernor.used,
    ),
  };
}


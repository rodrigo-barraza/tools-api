import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface CraigslistListingDocument {
  /** Stable token from the listing URL — unique per post */
  postId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrls?: string[];
  /** Craigslist site subdomain, e.g. "vancouver" */
  site: string;
  /** Section code: sss, jjj, hhh, bbb, ggg, cta */
  section: string;
  /** Search keys (site|section|query) that have surfaced this listing */
  searchKeys: string[];
  /** When we first observed the listing — the canonical listing date */
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Set when the listing stops appearing in search results (sold/expired) */
  missingSince: Date | null;
}

export interface CraigslistSearchDocument {
  /** site|section|normalized query */
  searchKey: string;
  site: string;
  section: string;
  query: string;
  lastFetchedAt: Date | null;
  lastResultCount: number | null;
  totalFetches: number;
  createdAt: Date;
}

export interface CraigslistGovernorState {
  key: string;
  /** YYYY-MM-DD (UTC) the current budget window belongs to */
  day: string;
  used: number;
  breakerUntil: Date | null;
  breakerStrikes: number;
}

export interface ListingQueryOptions {
  from?: Date;
  to?: Date;
  limit?: number;
}

// ─── Collection References ──────────────────────────────────────
let listings: Collection<CraigslistListingDocument> | null = null;
let searches: Collection<CraigslistSearchDocument> | null = null;
let governor: Collection<CraigslistGovernorState> | null = null;

const GOVERNOR_KEY = "craigslist";

/**
 * Initialize the Craigslist collections with required indexes.
 * Listings are archival — nothing here ever expires or is deleted.
 */
export async function setupCraigslistCollections(): Promise<void> {
  const database = getDatabase();

  const listingsInstance = database.collection<CraigslistListingDocument>(
    "craigslistListings",
  ) as unknown as Collection<CraigslistListingDocument>;
  await listingsInstance.createIndex({ postId: 1 }, { unique: true });
  await listingsInstance.createIndex({ searchKeys: 1, firstSeenAt: -1 });
  await listingsInstance.createIndex({ site: 1, section: 1 });
  await listingsInstance.createIndex({ postedAt: -1 });

  const searchesInstance = database.collection<CraigslistSearchDocument>(
    "craigslistSearches",
  ) as unknown as Collection<CraigslistSearchDocument>;
  await searchesInstance.createIndex({ searchKey: 1 }, { unique: true });

  const governorInstance = database.collection<CraigslistGovernorState>(
    "craigslistGovernor",
  ) as unknown as Collection<CraigslistGovernorState>;
  await governorInstance.createIndex({ key: 1 }, { unique: true });

  listings = listingsInstance;
  searches = searchesInstance;
  governor = governorInstance;
  logger.info("📋 Craigslist collection indexes ready");
}

// ─── Search Registry ─────────────────────────────────────────────

export async function getOrCreateSearch(
  searchKey: string,
  site: string,
  section: string,
  query: string,
): Promise<CraigslistSearchDocument | null> {
  if (!searches) return null;
  const result = await searches.findOneAndUpdate(
    { searchKey },
    {
      $setOnInsert: {
        searchKey,
        site,
        section,
        query,
        lastFetchedAt: null,
        lastResultCount: null,
        totalFetches: 0,
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  return result;
}

export async function recordSearchFetch(
  searchKey: string,
  resultCount: number,
): Promise<void> {
  if (!searches) return;
  await searches.updateOne(
    { searchKey },
    {
      $set: { lastFetchedAt: new Date(), lastResultCount: resultCount },
      $inc: { totalFetches: 1 },
    },
  );
}

// ─── Listing Upserts ─────────────────────────────────────────────

export interface ParsedListing {
  postId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrls?: string[];
}

/**
 * Bulk upsert listings surfaced by one search fetch.
 * Reappearing listings get missingSince cleared.
 */
export async function upsertListings(
  searchKey: string,
  site: string,
  section: string,
  parsed: ParsedListing[],
): Promise<{ upserted: number; modified: number }> {
  if (!listings || parsed.length === 0) return { upserted: 0, modified: 0 };

  const now = new Date();
  const operations = parsed.map((listing: ParsedListing) => ({
    updateOne: {
      filter: { postId: listing.postId },
      update: {
        $set: {
          url: listing.url,
          title: listing.title,
          price: listing.price,
          currency: listing.currency,
          location: listing.location,
          latitude: listing.latitude ?? null,
          longitude: listing.longitude ?? null,
          imageUrls: listing.imageUrls ?? [],
          site,
          section,
          lastSeenAt: now,
          missingSince: null,
        },
        $addToSet: { searchKeys: searchKey },
        $setOnInsert: { firstSeenAt: now },
      },
      upsert: true,
    },
  }));

  try {
    const result = await listings.bulkWrite(operations, { ordered: false });
    return { upserted: result.upsertedCount, modified: result.modifiedCount };
  } catch (error: unknown) {
    logger.error("Failed to upsert Craigslist listings:", errorMessage(error));
    return { upserted: 0, modified: 0 };
  }
}

/**
 * Mark listings for a search that no longer appear in fresh results.
 */
export async function markMissingListings(
  searchKey: string,
  presentPostIds: string[],
): Promise<number> {
  if (!listings) return 0;
  const result = await listings.updateMany(
    {
      searchKeys: searchKey,
      postId: { $nin: presentPostIds },
      missingSince: null,
    },
    { $set: { missingSince: new Date() } },
  );
  return result.modifiedCount;
}

// ─── Archive Queries ─────────────────────────────────────────────

/**
 * Query the archive for a search, newest first.
 * Date filters apply to firstSeenAt — when the listing entered the archive.
 */
export async function getListingsForSearch(
  searchKey: string,
  { from, to, limit = 50 }: ListingQueryOptions = {},
): Promise<CraigslistListingDocument[]> {
  if (!listings) return [];

  const query: Record<string, unknown> = { searchKeys: searchKey };
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.$gte = from;
  if (to) dateFilter.$lte = to;
  if (Object.keys(dateFilter).length > 0) {
    query.firstSeenAt = dateFilter;
  }

  return listings
    .find(query)
    .sort({ firstSeenAt: -1 })
    .limit(limit)
    .toArray();
}

export async function countNewListingsSince(
  searchKey: string,
  since: Date,
): Promise<number> {
  if (!listings) return 0;
  return listings.countDocuments({
    searchKeys: searchKey,
    firstSeenAt: { $gte: since },
  });
}

// ─── Request Governor State ──────────────────────────────────────
// Persisted in Mongo so the daily budget and circuit breaker survive
// service restarts. The budget day rolls over at UTC midnight.

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getGovernorState(): Promise<CraigslistGovernorState> {
  const fallback: CraigslistGovernorState = {
    key: GOVERNOR_KEY,
    day: currentDay(),
    used: 0,
    breakerUntil: null,
    breakerStrikes: 0,
  };
  if (!governor) return fallback;

  const state = await governor.findOne({ key: GOVERNOR_KEY });
  if (!state) return fallback;

  if (state.day !== currentDay()) {
    // New budget day — reset usage, keep breaker state
    await governor.updateOne(
      { key: GOVERNOR_KEY },
      { $set: { day: currentDay(), used: 0 } },
    );
    return { ...state, day: currentDay(), used: 0 };
  }
  return state;
}

/**
 * Atomically consume budget for `count` requests.
 * Returns false (consuming nothing) if the daily cap would be exceeded.
 */
export async function tryConsumeBudget(
  count: number,
  dailyCap: number,
): Promise<boolean> {
  if (!governor) return false;
  const day = currentDay();

  await governor.updateOne(
    { key: GOVERNOR_KEY },
    {
      $setOnInsert: {
        day,
        used: 0,
        breakerUntil: null,
        breakerStrikes: 0,
      },
    },
    { upsert: true },
  );
  // Roll the day over if stale (resets used)
  await governor.updateOne(
    { key: GOVERNOR_KEY, day: { $ne: day } },
    { $set: { day, used: 0 } },
  );

  const result = await governor.updateOne(
    { key: GOVERNOR_KEY, day, used: { $lte: dailyCap - count } },
    { $inc: { used: count } },
  );
  return result.modifiedCount > 0;
}

/**
 * Trip the circuit breaker after a block/403 — exponential backoff,
 * 12h doubling per consecutive strike, capped at 48h.
 */
export async function tripBreaker(): Promise<Date> {
  const state = await getGovernorState();
  const strikes = Math.min(state.breakerStrikes + 1, 3);
  const hours = 12 * Math.pow(2, strikes - 1);
  const until = new Date(Date.now() + hours * 3_600_000);
  if (governor) {
    await governor.updateOne(
      { key: GOVERNOR_KEY },
      { $set: { breakerUntil: until, breakerStrikes: strikes } },
      { upsert: true },
    );
  }
  logger.warn(
    `[Craigslist] 🚫 Circuit breaker tripped (strike ${strikes}) — cooling down until ${until.toISOString()}`,
  );
  return until;
}

/** Clear breaker strikes after a successful fetch. */
export async function resetBreaker(): Promise<void> {
  if (!governor) return;
  await governor.updateOne(
    { key: GOVERNOR_KEY, breakerStrikes: { $gt: 0 } },
    { $set: { breakerUntil: null, breakerStrikes: 0 } },
  );
}

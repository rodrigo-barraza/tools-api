import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Generic Classifieds Archive ─────────────────────────────────
// Shared archive-first storage for scraped classifieds sources
// (kijiji, autotrader, …). Same design as the Craigslist archive:
// listings are permanent, searches gate freshness, and a per-source
// governor persists the daily budget + circuit breaker across
// restarts. Craigslist predates this module and keeps its own
// collections; new scraped sources should use this one.

// ─── Types ──────────────────────────────────────────────────────
export interface ClassifiedListingDocument {
  /** Source marketplace, e.g. "kijiji", "autotrader" */
  source: string;
  /** Source-native unique listing id */
  postId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrls?: string[];
  /** Source-specific site/region slug, e.g. "greater-vancouver-area" */
  site: string;
  /** Source-specific section/category code */
  section: string;
  /** Search keys (source|site|section|query) that surfaced this listing */
  searchKeys: string[];
  /** Real posting date when the source provides one; else null */
  postedAt: Date | null;
  description: string | null;
  /** Source-specific structured attributes (e.g. make/model/mileage) */
  attributes?: Record<string, string | number | null>;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Set when the listing stops appearing in fresh results */
  missingSince: Date | null;
}

export interface ClassifiedsSearchDocument {
  source: string;
  /** source|site|section|normalized query */
  searchKey: string;
  site: string;
  section: string;
  query: string;
  lastFetchedAt: Date | null;
  lastResultCount: number | null;
  totalFetches: number;
  createdAt: Date;
}

export interface ClassifiedsGovernorState {
  /** Source name — one governor doc per source */
  key: string;
  day: string;
  used: number;
  breakerUntil: Date | null;
  breakerStrikes: number;
}

export interface ClassifiedsQueryOptions {
  from?: Date;
  to?: Date;
  limit?: number;
}

// ─── Collection References ──────────────────────────────────────
let listings: Collection<ClassifiedListingDocument> | null = null;
let searches: Collection<ClassifiedsSearchDocument> | null = null;
let governor: Collection<ClassifiedsGovernorState> | null = null;

/**
 * Initialize the shared classifieds collections. Archival — nothing
 * here ever expires or is deleted.
 */
export async function setupClassifiedsCollections(): Promise<void> {
  const database = getDatabase();

  const listingsInstance = database.collection<ClassifiedListingDocument>(
    "classifiedsListings",
  ) as unknown as Collection<ClassifiedListingDocument>;
  await listingsInstance.createIndex({ source: 1, postId: 1 }, { unique: true });
  await listingsInstance.createIndex({ searchKeys: 1, firstSeenAt: -1 });
  await listingsInstance.createIndex({ source: 1, site: 1, section: 1 });

  const searchesInstance = database.collection<ClassifiedsSearchDocument>(
    "classifiedsSearches",
  ) as unknown as Collection<ClassifiedsSearchDocument>;
  await searchesInstance.createIndex({ searchKey: 1 }, { unique: true });

  const governorInstance = database.collection<ClassifiedsGovernorState>(
    "classifiedsGovernor",
  ) as unknown as Collection<ClassifiedsGovernorState>;
  await governorInstance.createIndex({ key: 1 }, { unique: true });

  listings = listingsInstance;
  searches = searchesInstance;
  governor = governorInstance;
  logger.info("🗂️ Classifieds archive collection indexes ready");
}

// ─── Search Registry ─────────────────────────────────────────────

export async function getOrCreateClassifiedsSearch(
  source: string,
  searchKey: string,
  site: string,
  section: string,
  query: string,
): Promise<ClassifiedsSearchDocument | null> {
  if (!searches) return null;
  return searches.findOneAndUpdate(
    { searchKey },
    {
      $setOnInsert: {
        source,
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
}

export async function recordClassifiedsSearchFetch(
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

export interface ParsedClassifiedListing {
  postId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string | null;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrls?: string[];
  postedAt?: Date | null;
  description?: string | null;
  attributes?: Record<string, string | number | null>;
}

export async function upsertClassifiedListings(
  source: string,
  searchKey: string,
  site: string,
  section: string,
  parsed: ParsedClassifiedListing[],
): Promise<{ upserted: number; modified: number }> {
  if (!listings || parsed.length === 0) return { upserted: 0, modified: 0 };

  const now = new Date();
  const operations = parsed.map((listing: ParsedClassifiedListing) => ({
    updateOne: {
      filter: { source, postId: listing.postId },
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
          postedAt: listing.postedAt ?? null,
          description: listing.description ?? null,
          attributes: listing.attributes ?? {},
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
    logger.error(
      `Failed to upsert ${source} listings:`,
      errorMessage(error),
    );
    return { upserted: 0, modified: 0 };
  }
}

export async function markMissingClassifiedListings(
  source: string,
  searchKey: string,
  presentPostIds: string[],
): Promise<number> {
  if (!listings) return 0;
  const result = await listings.updateMany(
    {
      source,
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
 * Query the archive for a search, newest first. Date filters apply to
 * the listing date (postedAt when the source provides one, else
 * firstSeenAt).
 */
export async function getClassifiedListingsForSearch(
  searchKey: string,
  { from, to, limit = 50 }: ClassifiedsQueryOptions = {},
): Promise<(ClassifiedListingDocument & { effectiveDate: Date })[]> {
  if (!listings) return [];

  const pipeline: Record<string, unknown>[] = [
    { $match: { searchKeys: searchKey } },
    {
      $addFields: {
        effectiveDate: { $ifNull: ["$postedAt", "$firstSeenAt"] },
      },
    },
  ];

  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.$gte = from;
  if (to) dateFilter.$lte = to;
  if (Object.keys(dateFilter).length > 0) {
    pipeline.push({ $match: { effectiveDate: dateFilter } });
  }

  pipeline.push({ $sort: { effectiveDate: -1 } }, { $limit: limit });

  return listings.aggregate(pipeline).toArray() as Promise<
    (ClassifiedListingDocument & { effectiveDate: Date })[]
  >;
}

export async function countNewClassifiedListingsSince(
  searchKey: string,
  since: Date,
): Promise<number> {
  if (!listings) return 0;
  return listings.countDocuments({
    searchKeys: searchKey,
    firstSeenAt: { $gte: since },
  });
}

// ─── Per-Source Request Governor ─────────────────────────────────
// Same semantics as the Craigslist governor: daily budget rolls over
// at UTC midnight; breaker backs off 12h → 24h → 48h.

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getClassifiedsGovernorState(
  source: string,
): Promise<ClassifiedsGovernorState> {
  const fallback: ClassifiedsGovernorState = {
    key: source,
    day: currentDay(),
    used: 0,
    breakerUntil: null,
    breakerStrikes: 0,
  };
  if (!governor) return fallback;

  const state = await governor.findOne({ key: source });
  if (!state) return fallback;

  if (state.day !== currentDay()) {
    await governor.updateOne(
      { key: source },
      { $set: { day: currentDay(), used: 0 } },
    );
    return { ...state, day: currentDay(), used: 0 };
  }
  return state;
}

export async function tryConsumeClassifiedsBudget(
  source: string,
  count: number,
  dailyCap: number,
): Promise<boolean> {
  if (!governor) return false;
  const day = currentDay();

  await governor.updateOne(
    { key: source },
    {
      $setOnInsert: { day, used: 0, breakerUntil: null, breakerStrikes: 0 },
    },
    { upsert: true },
  );
  await governor.updateOne(
    { key: source, day: { $ne: day } },
    { $set: { day, used: 0 } },
  );

  const result = await governor.updateOne(
    { key: source, day, used: { $lte: dailyCap - count } },
    { $inc: { used: count } },
  );
  return result.modifiedCount > 0;
}

export async function tripClassifiedsBreaker(source: string): Promise<Date> {
  const state = await getClassifiedsGovernorState(source);
  const strikes = Math.min(state.breakerStrikes + 1, 3);
  const hours = 12 * Math.pow(2, strikes - 1);
  const until = new Date(Date.now() + hours * 3_600_000);
  if (governor) {
    await governor.updateOne(
      { key: source },
      { $set: { breakerUntil: until, breakerStrikes: strikes } },
      { upsert: true },
    );
  }
  logger.warn(
    `[${source}] 🚫 Circuit breaker tripped (strike ${strikes}) — cooling down until ${until.toISOString()}`,
  );
  return until;
}

export async function resetClassifiedsBreaker(source: string): Promise<void> {
  if (!governor) return;
  await governor.updateOne(
    { key: source, breakerStrikes: { $gt: 0 } },
    { $set: { breakerUntil: null, breakerStrikes: 0 } },
  );
}

import { upsertNeos } from "../models/Neo.ts";
import { type NearEarthObject } from "../fetchers/weather/NeoFetcher.ts";

interface CacheError {
  message: string;
  time: string;
}

const cache: {
  neos: NearEarthObject[];
  lastFetch: Date | null;
  error: CacheError | null;
} = {
  neos: [],
  lastFetch: null,
  error: null,
};

/**
 * Update the cache with freshly fetched NEO data and persist to DB.
 */
export async function updateNeos(neos: NearEarthObject[]) {
  cache.neos = neos;
  cache.lastFetch = new Date();
  cache.error = null;
  return await upsertNeos(neos);
}

/**
 * Restore NEOs from a DB snapshot into the in-memory cache.
 * Memory-only — no MongoDB upsert.
 */
export function restoreNeos(neos: NearEarthObject[]) {
  cache.neos = neos;
  cache.lastFetch = new Date();
  cache.error = null;
}

export function setNeoError(error: { message: string }) {
  cache.error = { message: error.message, time: new Date().toISOString() };
}

/**
 * Get today's near-Earth objects from cache.
 */
export function getLatestNeos() {
  return [...cache.neos];
}

/**
 * Summary: total count, hazardous count, closest approach, largest object.
 */
export function getNeoSummary() {
  const hazardous = cache.neos.filter(
    (nearEarthObject: NearEarthObject) => nearEarthObject.isPotentiallyHazardous,
  );
  const closest = cache.neos[0] || null; // already sorted by miss distance
  const largest = cache.neos.reduce(
    (max: NearEarthObject | null, nearEarthObject: NearEarthObject) =>
      (nearEarthObject.estimatedDiameterMaxKm ?? 0) > (max?.estimatedDiameterMaxKm ?? 0)
        ? nearEarthObject
        : max,
    null,
  );

  return {
    total: cache.neos.length,
    hazardousCount: hazardous.length,
    closest,
    largest,
    lastFetch: cache.lastFetch,
  };
}

export function getNeoHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    neoCount: cache.neos.length,
  };
}

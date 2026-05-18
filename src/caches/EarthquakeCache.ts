import { upsertEarthquakes } from "../models/Earthquake.ts";
import { EARTHQUAKE_MAGNITUDE_SCALE } from "../constants.ts";

/**
 * In-memory cache for the latest earthquake feed.
 * Separate from WeatherCache since earthquake data is event-based,
 * not a single rolling snapshot.
 */

const cache = {
  events: [] as any[],
  lastFetch: null as any,
  error: null as any,
};

/**
 * Update the cache with freshly fetched earthquake events.
 * Persists to MongoDB via upsert (deduplication by USGS ID).
 */
export async function updateEarthquakes(events: any) {
  cache.events = events;
  cache.lastFetch = new Date();
  cache.error = null;

  const result = await upsertEarthquakes(events);
  return result;
}

/**
 * Restore earthquakes from a DB snapshot into the in-memory cache.
 * Memory-only — no MongoDB upsert.
 */
export function restoreEarthquakes(events: any) {
  cache.events = events;
  cache.lastFetch = new Date();
  cache.error = null;
}

/**
 * Record a fetch error.
 */
export function setEarthquakeError(error: any) {
  cache.error = {
    message: error.message,
    time: new Date().toISOString(),
  };
}

/**
 * Get the latest hourly feed from memory.
 */
export function getLatestEarthquakes() {
  return [...cache.events];
}

/**
 * Get a summary of the latest feed — counts by magnitude bracket + strongest event.
 */
export function getEarthquakeSummary() {
  const counts: Record<string, any> = {};
  for (const scale of EARTHQUAKE_MAGNITUDE_SCALE) {
    counts[scale.label] = 0;
  }

  let strongest: any = null;

  for (const event of cache.events) {
    // Classify into magnitude bracket
    const scale = EARTHQUAKE_MAGNITUDE_SCALE.find(
      (s: any) => event.magnitude >= s.min && event.magnitude < s.max,
    );
    if (scale) {
      counts[scale.label]++;
    }

    // Track strongest
    if (!strongest || (event.magnitude ?? -1) > (strongest.magnitude ?? -1)) {
      strongest = event;
    }
  }

  return {
    total: cache.events.length,
    counts,
    strongest,
    lastFetch: cache.lastFetch,
  };
}

/**
 * Get earthquake health info for the /health endpoint.
 */
export function getEarthquakeHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    eventCount: cache.events.length,
  };
}

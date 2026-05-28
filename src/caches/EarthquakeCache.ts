import { upsertEarthquakes } from "../models/Earthquake.ts";
import { EARTHQUAKE_MAGNITUDE_SCALE } from "../constants.ts";

/**
 * In-memory cache for the latest earthquake feed.
 * Separate from WeatherCache since earthquake data is event-based,
 * not a single rolling snapshot.
 */

interface EarthquakeEvent {
  usgsId: string;
  magnitude: number | null;
  [key: string]: unknown;
}

interface CacheError {
  message: string;
  time: string;
}

const cache: {
  events: EarthquakeEvent[];
  lastFetch: Date | null;
  error: CacheError | null;
} = {
  events: [],
  lastFetch: null,
  error: null,
};

/**
 * Update the cache with freshly fetched earthquake events.
 * Persists to MongoDB via upsert (deduplication by USGS ID).
 */
export async function updateEarthquakes(events: EarthquakeEvent[]) {
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
export function restoreEarthquakes(events: EarthquakeEvent[]) {
  cache.events = events;
  cache.lastFetch = new Date();
  cache.error = null;
}

/**
 * Record a fetch error.
 */
export function setEarthquakeError(error: { message: string }) {
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
  const counts: Record<string, number> = {};
  for (const scale of EARTHQUAKE_MAGNITUDE_SCALE) {
    counts[scale.label] = 0;
  }

  let strongest: EarthquakeEvent | null = null;

  for (const event of cache.events) {
    // Classify into magnitude bracket
    const scale = EARTHQUAKE_MAGNITUDE_SCALE.find(
      (s) =>
        event.magnitude !== null &&
        event.magnitude >= s.min &&
        event.magnitude < s.max,
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

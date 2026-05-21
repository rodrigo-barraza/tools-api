import { createHash } from "crypto";
import { insertSnapshot } from "../models/WeatherSnapshot.ts";
import logger from "../logger.ts";

/**
 * In-memory cache for the latest weather data.
 * Data refreshes every 20 seconds, so memory reads are preferred
 * over MongoDB queries for API consumers.
 */

type WeatherSource = "openmeteo" | "airquality" | "tomorrowio" | "tomorrowio_daily";

const cache = {
  // Merged current snapshot
  current: {} as Record<string, unknown>,

  // Last fetch timestamps per source
  lastFetch: {
    openmeteo: null,
    airquality: null,
    tomorrowio: null,
    tomorrowio_daily: null,
  } as Record<WeatherSource, Date | null>,

  // Error tracking
  errors: {
    openmeteo: null,
    airquality: null,
    tomorrowio: null,
    tomorrowio_daily: null,
  } as Record<WeatherSource, { message: string; time: string } | null>,

  // Tracks which sources have reported since last persist
  pendingSources: new Set<string>(),
};

const ALL_SOURCES: WeatherSource[] = [
  "openmeteo",
  "airquality",
  "tomorrowio",
  "tomorrowio_daily",
];
let allSourcesReady = false;
let lastPersistedHash: string | null = null;

/**
 * Hash the current snapshot for change detection.
 */
function hashSnapshot(data: Record<string, unknown>) {
  return createHash("md5").update(JSON.stringify(data)).digest("hex");
}

/**
 * Merge incoming data from a source into the cache.
 * Waits for all sources on first cycle, then persists on every change.
 */
export function update(source: WeatherSource, data: Record<string, unknown>) {
  const { source: _src, ...fields } = data;
  Object.assign(cache.current, fields);
  cache.lastFetch[source] = new Date();
  cache.errors[source] = null;

  if (!allSourcesReady) {
    cache.pendingSources.add(source);
    if (ALL_SOURCES.every((s) => cache.pendingSources.has(s))) {
      allSourcesReady = true;
      cache.pendingSources.clear();
      lastPersistedHash = hashSnapshot(cache.current);
      persist();
      logger.info("[Nimbus] 📸 Initial snapshot persisted");
    }
  } else {
    const currentHash = hashSnapshot(cache.current);
    if (currentHash !== lastPersistedHash) {
      lastPersistedHash = currentHash;
      persist();
      logger.info("[Nimbus] 📸 Data changed — snapshot persisted");
    }
  }
}

/**
 * Restore a source's data from a DB snapshot into the cache.
 * Memory-only — no change-detection or MongoDB persistence.
 */
export function restore(source: WeatherSource, data: Record<string, unknown>) {
  const { source: _src, ...fields } = data;
  Object.assign(cache.current, fields);
  cache.lastFetch[source] = new Date();
  cache.errors[source] = null;
}

/**
 * Record a fetch error for a source.
 */
export function setError(source: WeatherSource, error: { message: string }) {
  cache.errors[source] = {
    message: error.message,
    time: new Date().toISOString(),
  };
}

/**
 * Save current cache state to MongoDB.
 */
export async function persist() {
  await insertSnapshot(cache.current);
}

/**
 * Get the full merged snapshot from memory.
 */
export function getLatest() {
  return { ...cache.current };
}

/**
 * Get current conditions only (no forecast arrays).
 */
export function getCurrent() {
  const {
    hourlyForecast: _hf,
    dailyForecast: _df,
    hourlyAirQuality: _haq,
    tomorrowIODailyForecast: _tdf,
    ...current
  } = cache.current;
  return current;
}

/**
 * Get forecast data only.
 */
export function getForecasts() {
  return {
    hourlyForecast: cache.current.hourlyForecast || [],
    dailyForecast: cache.current.dailyForecast || [],
    hourlyAirQuality: cache.current.hourlyAirQuality || [],
    tomorrowIODailyForecast: cache.current.tomorrowIODailyForecast || [],
  };
}

/**
 * Get air quality data only.
 */
export function getAirQuality() {
  return {
    usAqi: cache.current.usAqi,
    europeanAqi: cache.current.europeanAqi,
    pm25: cache.current.pm25,
    pm10: cache.current.pm10,
    ozone: cache.current.ozone,
    carbonMonoxide: cache.current.carbonMonoxide,
    nitrogenDioxide: cache.current.nitrogenDioxide,
    dust: cache.current.dust,
    hourlyAirQuality: cache.current.hourlyAirQuality || [],
  };
}

/**
 * Get daylight data only.
 */
export function getDaylight() {
  return {
    sunrise: cache.current.sunrise,
    sunset: cache.current.sunset,
    daylightDuration: cache.current.daylightDuration,
    moonrise: cache.current.moonrise,
    moonset: cache.current.moonset,
    isDay: cache.current.isDay,
  };
}

/**
 * Get service health status.
 */
export function getHealth() {
  return {
    status: "ok",
    lastFetch: { ...cache.lastFetch },
    errors: { ...cache.errors },
    cacheSize: Object.keys(cache.current).length,
  };
}

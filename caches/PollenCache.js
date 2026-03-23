/**
 * In-memory cache for pollen data.
 * Stored separately from WeatherCache since pollen is a distinct domain.
 */

const cache = {
  data: null,
  lastFetch: null,
  error: null,
};

/**
 * Update pollen cache with fresh data.
 */
export function updatePollen(data) {
  cache.data = data;
  cache.lastFetch = new Date();
  cache.error = null;
}

/**
 * Record a fetch error.
 */
export function setPollenError(error) {
  cache.error = {
    message: error.message,
    time: new Date(),
  };
}

/**
 * Get full pollen data.
 */
export function getPollen() {
  if (!cache.data) return { status: "no_data", lastFetch: null };
  return {
    ...cache.data,
    lastFetch: cache.lastFetch,
  };
}

/**
 * Get today's pollen only.
 */
export function getPollenToday() {
  if (!cache.data?.daily?.length) return { status: "no_data" };
  const today = cache.data.daily[0];
  return {
    ...today,
    regionCode: cache.data.regionCode,
    lastFetch: cache.lastFetch,
  };
}

/**
 * Get health status.
 */
export function getPollenHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    hasForecast: cache.data?.daily?.length > 0,
    forecastDays: cache.data?.daily?.length || 0,
  };
}

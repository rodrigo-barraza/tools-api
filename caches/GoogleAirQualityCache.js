/**
 * In-memory cache for Google Air Quality data.
 * Stored separately from WeatherCache since Google AQ provides
 * richer data (health recs, color codes) than Open-Meteo AQ.
 */

const cache = {
  data: null,
  lastFetch: null,
  error: null,
};

/**
 * Update cache with fresh Google Air Quality data.
 */
export function updateGoogleAirQuality(data) {
  cache.data = data;
  cache.lastFetch = new Date();
  cache.error = null;
}

/**
 * Record a fetch error.
 */
export function setGoogleAirQualityError(error) {
  cache.error = {
    message: error.message,
    time: new Date(),
  };
}

/**
 * Get full Google Air Quality data.
 */
export function getGoogleAirQuality() {
  if (!cache.data) return { status: "no_data", lastFetch: null };
  return {
    ...cache.data,
    lastFetch: cache.lastFetch,
  };
}

/**
 * Get health status.
 */
export function getGoogleAirQualityHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    hasData: cache.data !== null,
  };
}

import { KP_STORM_SCALE } from "../constants.js";

const cache = {
  readings: [],
  lastFetch: null,
  error: null,
};

/**
 * Classify a Kp value into its storm scale level.
 */
function classifyKp(kp) {
  const entry = KP_STORM_SCALE.find((s) => kp >= s.min && kp < s.max);
  return entry || { level: "Unknown", storm: null };
}

/**
 * Update the cache with fresh Kp readings.
 */
export function updateKpIndex(readings) {
  cache.readings = readings;
  cache.lastFetch = new Date();
  cache.error = null;
}

export function setKpIndexError(error) {
  cache.error = { message: error.message, time: new Date() };
}

/**
 * Get the full 7-day Kp history.
 */
export function getKpHistory() {
  return {
    readings: cache.readings,
    lastFetch: cache.lastFetch,
  };
}

/**
 * Get the current (latest) Kp reading with storm classification.
 */
export function getCurrentKp() {
  const latest = cache.readings[cache.readings.length - 1] || null;
  if (!latest) {
    return { current: null, classification: null, lastFetch: cache.lastFetch };
  }

  const classification = classifyKp(latest.kp);

  // Find peak in last 24 hours
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last24h = cache.readings.filter((r) => r.time >= dayAgo);
  const peak = last24h.reduce(
    (max, r) => (r.kp > (max?.kp ?? -1) ? r : max),
    null,
  );

  return {
    current: latest,
    classification,
    peak24h: peak,
    peakClassification: peak ? classifyKp(peak.kp) : null,
    lastFetch: cache.lastFetch,
  };
}

export function getKpHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    readingCount: cache.readings.length,
  };
}

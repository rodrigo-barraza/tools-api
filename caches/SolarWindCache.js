import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache();

// Default data shape for solar wind
cache.update({ plasma: [], magnetic: [], latest: {}, counts: {} });
// Reset lastFetch since this was just initialization, not a real fetch
const initialState = { update: cache.update, setError: cache.setError };

export function updateSolarWind(data) {
  initialState.update(data);
}

export const setSolarWindError = cache.setError;

export function getSolarWind() {
  const data = cache.getData();
  return {
    plasma: data.plasma,
    magnetic: data.magnetic,
    counts: data.counts,
    lastFetch: cache.getLastFetch(),
  };
}

export function getSolarWindLatest() {
  const data = cache.getData();
  return {
    ...data.latest,
    lastFetch: cache.getLastFetch(),
  };
}

export function getSolarWindHealth() {
  return {
    lastFetch: cache.getLastFetch(),
    error: cache.getHealth().error,
    plasmaPoints: cache.getData()?.counts?.plasma ?? 0,
    magneticPoints: cache.getData()?.counts?.magnetic ?? 0,
  };
}

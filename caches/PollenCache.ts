import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache();

export const updatePollen = cache.update;
export const setPollenError = cache.setError;
export const getPollen = cache.get;
export const getPollenHealth = () => {
  const data = cache.getData();
  return {
    lastFetch: cache.getLastFetch(),
    error: cache.getHealth().error,
    hasForecast: data?.daily?.length > 0,
    forecastDays: data?.daily?.length || 0,
  };
};

/** Get today's pollen only. */
export function getPollenToday() {
  const data = cache.getData();
  if (!data?.daily?.length) return { status: "no_data" };
  const today = data.daily[0];
  return {
    ...today,
    regionCode: data.regionCode,
    lastFetch: cache.getLastFetch(),
  };
}

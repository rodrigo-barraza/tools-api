import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache({ type: "array", itemsKey: "events" });

export const updateWildfires = cache.update;
export const setWildfireError = cache.setError;
export const getWildfires = cache.get;
export const getWildfireHealth = cache.getHealth;

/** Get a summary with the largest active fire. */
export function getWildfireSummary() {
  const wildfires = cache.getData();
  const sorted = [...wildfires]
    .filter((w) => w.magnitudeValue != null)
    .sort((a, b) => b.magnitudeValue - a.magnitudeValue);

  return {
    count: wildfires.length,
    largest: sorted[0] || null,
    openCount: wildfires.filter((w) => w.status === "open").length,
    lastFetch: cache.getLastFetch(),
  };
}

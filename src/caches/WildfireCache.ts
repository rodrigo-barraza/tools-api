import { createSimpleCache } from "./createSimpleCache.ts";
import { WildfireEvent } from "../types/weather.ts";

const cache = createSimpleCache<WildfireEvent[]>({ type: "array", itemsKey: "events" });

export const updateWildfires = cache.update;
export const setWildfireError = cache.setError;
export const getWildfires = cache.get;
export const getWildfireHealth = cache.getHealth;

/** Get a summary with the largest active fire. */
export function getWildfireSummary() {
  const wildfires = cache.getData();
  const sorted = [...wildfires]
    .filter((item) => item.magnitudeValue != null)
    .sort((firstItem, b) => (b.magnitudeValue ?? 0) - (firstItem.magnitudeValue ?? 0));

  return {
    count: wildfires.length,
    largest: sorted[0] || null,
    openCount: wildfires.filter((wildfire) => wildfire.status === "open").length,
    lastFetch: cache.getLastFetch(),
  };
}

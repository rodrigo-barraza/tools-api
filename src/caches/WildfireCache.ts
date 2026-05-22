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
    .filter((w) => w.magnitudeValue != null)
    .sort((a, b) => (b.magnitudeValue ?? 0) - (a.magnitudeValue ?? 0));

  return {
    count: wildfires.length,
    largest: sorted[0] || null,
    openCount: wildfires.filter((w) => w.status === "open").length,
    lastFetch: cache.getLastFetch(),
  };
}

import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache({ type: "array", itemsKey: "predictions" });

export const updateTides = cache.update;
export const setTideError = cache.setError;
export const getTides = cache.get;
export const getTideHealth = cache.getHealth;

/** Get the next upcoming tide prediction. */
export function getNextTide() {
  const tides = cache.getData();
  const now = new Date();
  const upcoming = tides.find((t) => new Date(t.time) > now);
  return {
    next: upcoming || null,
    lastFetch: cache.getLastFetch(),
  };
}

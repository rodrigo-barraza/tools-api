import { createSimpleCache } from "./createSimpleCache.ts";

interface TidePrediction {
  time: string;
  height: number;
  type: string;
}

const cache = createSimpleCache<TidePrediction[]>({
  type: "array",
  itemsKey: "predictions",
});

export const updateTides = cache.update;
export const setTideError = cache.setError;
export const getTides = cache.get;
export const getTideHealth = cache.getHealth;

/** Get the next upcoming tide prediction. */
export function getNextTide() {
  const tides = cache.getData();
  const now = new Date();
  const upcoming = tides.find((tide) => new Date(tide.time) > now);
  return {
    next: upcoming || null,
    lastFetch: cache.getLastFetch(),
  };
}

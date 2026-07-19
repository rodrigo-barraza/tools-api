import { createSimpleCache } from "./createSimpleCache.ts";
import { FEAR_GREED_TTL_MS } from "../constants.ts";
import type { FearGreedEntry } from "../fetchers/finance/FearGreedFetcher.ts";

interface FearGreedData {
  current: FearGreedEntry | null;
  history: FearGreedEntry[];
}

const cache = createSimpleCache<FearGreedData>();

export function getCachedFearGreed() {
  const data = cache.getData();
  return {
    current: data?.current ?? null,
    history: data?.history ?? [],
    lastFetch: cache.getLastFetch(),
    error: cache.getHealth().error,
  };
}

export function isFearGreedStale(): boolean {
  const lastFetch = cache.getLastFetch();
  if (!lastFetch) return true;
  return Date.now() - new Date(lastFetch).getTime() > FEAR_GREED_TTL_MS;
}

export function updateFearGreed(
  current: FearGreedEntry | null,
  history: FearGreedEntry[],
) {
  cache.update({ current, history });
}

export function setFearGreedError(error: { message: string }) {
  cache.setError(new Error(error.message));
}

export function getFearGreedHealth() {
  const health = cache.getHealth();
  const data = cache.getData();
  return {
    lastFetch: health.lastFetch,
    error: health.error,
    hasCurrent: data?.current != null,
    historyCount: data?.history.length ?? 0,
  };
}

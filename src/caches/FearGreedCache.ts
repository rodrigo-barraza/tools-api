import { FEAR_GREED_TTL_MS } from "../constants.ts";
import type { FearGreedEntry } from "../fetchers/finance/FearGreedFetcher.ts";

interface FearGreedCacheState {
  current: FearGreedEntry | null;
  history: FearGreedEntry[];
  lastFetch: Date | null;
  error: { message: string; time: string } | null;
}

const cache: FearGreedCacheState = {
  current: null,
  history: [],
  lastFetch: null,
  error: null,
};

export function getCachedFearGreed(): FearGreedCacheState {
  return { ...cache };
}

export function isFearGreedStale(): boolean {
  if (!cache.lastFetch) return true;
  return Date.now() - cache.lastFetch.getTime() > FEAR_GREED_TTL_MS;
}

export function updateFearGreed(
  current: FearGreedEntry | null,
  history: FearGreedEntry[],
) {
  cache.current = current;
  cache.history = history;
  cache.lastFetch = new Date();
  cache.error = null;
}

export function setFearGreedError(error: { message: string }) {
  cache.error = { message: error.message, time: new Date().toISOString() };
}

export function getFearGreedHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    hasCurrent: cache.current != null,
    historyCount: cache.history.length,
  };
}

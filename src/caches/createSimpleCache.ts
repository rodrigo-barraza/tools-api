// ═══════════════════════════════════════════════════════════════
//  Simple Cache Factory
// ═══════════════════════════════════════════════════════════════
// Eliminates boilerplate across 10+ identical cache modules.
// Each cache gets: update, setError, get, getHealth, getData.
// Domain-specific getters can use getData() for custom logic.
// ═══════════════════════════════════════════════════════════════

export interface CacheError {
  message: string;
  time: string;
}

export interface CacheHealth {
  lastFetch: string | null;
  error: CacheError | null;
  count?: number;
  hasData?: boolean;
}

export interface SimpleCacheOptions {
  type?: "object" | "array";
  itemsKey?: string;
}

export interface SimpleCache<T> {
  update: (data: T) => void;
  setError: (error: Error) => void;
  get: () => Record<string, unknown>;
  getHealth: () => CacheHealth;
  getData: () => T;
  getLastFetch: () => string | null;
}

/**
 * Create a standard in-memory cache with update/error/get/health lifecycle.
 */
export function createSimpleCache<T = unknown>({
  type = "object",
  itemsKey = "items",
}: SimpleCacheOptions = {}): SimpleCache<T> {
  const cache: { data: T; lastFetch: string | null; error: CacheError | null } = {
    data: (type === "array" ? [] : null) as T,
    lastFetch: null,
    error: null,
  };

  /** Replace cached data and reset error state. */
  function update(data: T): void {
    cache.data = data;
    cache.lastFetch = new Date().toISOString();
    cache.error = null;
  }

  /** Record a fetch error. */
  function setError(error: Error): void {
    cache.error = { message: error.message, time: new Date().toISOString() };
  }

  /** Get the cached data with metadata. */
  function get(): Record<string, unknown> {
    if (type === "array") {
      const array = cache.data as unknown[];
      return {
        count: array.length,
        [itemsKey]: cache.data,
        lastFetch: cache.lastFetch,
      };
    }
    if (!cache.data) return { status: "no_data", lastFetch: null };
    return { ...(cache.data as Record<string, unknown>), lastFetch: cache.lastFetch };
  }

  /** Get health/status info for admin endpoints. */
  function getHealth(): CacheHealth {
    if (type === "array") {
      const array = cache.data as unknown[];
      return {
        lastFetch: cache.lastFetch,
        error: cache.error,
        count: array.length,
      };
    }
    return {
      lastFetch: cache.lastFetch,
      error: cache.error,
      hasData: cache.data !== null,
    };
  }

  /** Direct access to raw data for domain-specific extra getters. */
  function getData(): T {
    return cache.data;
  }

  /** Get lastFetch timestamp. */
  function getLastFetch(): string | null {
    return cache.lastFetch;
  }

  return { update, setError, get, getHealth, getData, getLastFetch };
}

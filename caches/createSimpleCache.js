// ═══════════════════════════════════════════════════════════════
//  Simple Cache Factory
// ═══════════════════════════════════════════════════════════════
// Eliminates boilerplate across 10+ identical cache modules.
// Each cache gets: update, setError, get, getHealth, getData.
// Domain-specific getters can use getData() for custom logic.
// ═══════════════════════════════════════════════════════════════

/**
 * Create a standard in-memory cache with update/error/get/health lifecycle.
 *
 * @param {object} [options]
 * @param {"object"|"array"} [options.type="object"] - Default shape: null (object) or [] (array)
 * @param {string} [options.itemsKey="items"] - Key name for the array in the getter response
 * @returns {{ update: Function, setError: Function, get: Function, getHealth: Function, getData: Function }}
 */
export function createSimpleCache({ type = "object", itemsKey = "items" } = {}) {
  const cache = {
    data: type === "array" ? [] : null,
    lastFetch: null,
    error: null,
  };

  /** Replace cached data and reset error state. */
  function update(data) {
    cache.data = data;
    cache.lastFetch = new Date().toISOString();
    cache.error = null;
  }

  /** Record a fetch error. */
  function setError(error) {
    cache.error = { message: error.message, time: new Date().toISOString() };
  }

  /** Get the cached data with metadata. */
  function get() {
    if (type === "array") {
      return {
        count: cache.data.length,
        [itemsKey]: cache.data,
        lastFetch: cache.lastFetch,
      };
    }
    if (!cache.data) return { status: "no_data", lastFetch: null };
    return { ...cache.data, lastFetch: cache.lastFetch };
  }

  /** Get health/status info for admin endpoints. */
  function getHealth() {
    if (type === "array") {
      return {
        lastFetch: cache.lastFetch,
        error: cache.error,
        count: cache.data.length,
      };
    }
    return {
      lastFetch: cache.lastFetch,
      error: cache.error,
      hasData: cache.data !== null,
    };
  }

  /** Direct access to raw data for domain-specific extra getters. */
  function getData() {
    return cache.data;
  }

  /** Get lastFetch timestamp. */
  function getLastFetch() {
    return cache.lastFetch;
  }

  return { update, setError, get, getHealth, getData, getLastFetch };
}

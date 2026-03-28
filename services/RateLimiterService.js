// ============================================================
// Rate Limiter Service
// ============================================================
// Token-bucket-style rate limiter that enforces minimum delay
// between sequential requests to each external API provider.
// Uses API_RATE_LIMITS from constants.js as the single source
// of truth for all rate limit values.
// ============================================================

import { API_RATE_LIMITS } from "../constants.js";

/**
 * Per-provider rate limiter.
 * Tracks last request time and enforces minimum delay between calls.
 */
class RateLimiterService {
  /** @type {Map<string, number>} provider → last request timestamp */
  #lastRequestAt = new Map();

  /** @type {Map<string, Promise<void>>} provider → pending wait promise (queue) */
  #queues = new Map();

  /**
   * Wait until it's safe to make a request to the given provider.
   * Enforces the requestDelayMs from API_RATE_LIMITS.
   * Multiple concurrent callers for the same provider are serialized
   * via a promise chain to prevent thundering herd.
   *
   * @param {string} provider - Key in API_RATE_LIMITS (e.g. "ETSY", "TICKETMASTER")
   * @returns {Promise<void>}
   */
  async wait(provider) {
    const limits = API_RATE_LIMITS[provider];
    if (!limits) {
      console.warn(`[RateLimiter] ⚠️ Unknown provider: ${provider}`);
      return;
    }

    const { requestDelayMs } = limits;
    if (!requestDelayMs || requestDelayMs <= 0) return;

    // Chain onto any pending wait for this provider
    const pending = this.#queues.get(provider) || Promise.resolve();
    const next = pending.then(() => this.#enforce(provider, requestDelayMs));
    this.#queues.set(provider, next);

    return next;
  }

  /**
   * Internal: sleep if needed to enforce minimum delay since last request.
   * @param {string} provider
   * @param {number} delayMs
   */
  async #enforce(provider, delayMs) {
    const last = this.#lastRequestAt.get(provider) || 0;
    const elapsed = Date.now() - last;
    const remaining = delayMs - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    this.#lastRequestAt.set(provider, Date.now());
  }

  /**
   * Get the configured delay for a provider (useful for logging/diagnostics).
   * @param {string} provider - Key in API_RATE_LIMITS
   * @returns {number|null} requestDelayMs or null if unknown
   */
  getDelay(provider) {
    return API_RATE_LIMITS[provider]?.requestDelayMs ?? null;
  }

  /**
   * Get current usage stats for a provider.
   * @param {string} provider
   * @returns {{ lastRequestAt: number|null, delayMs: number|null }}
   */
  getStats(provider) {
    return {
      lastRequestAt: this.#lastRequestAt.get(provider) ?? null,
      delayMs: this.getDelay(provider),
    };
  }

  /**
   * Get all rate limit definitions (for admin/status endpoints).
   * @returns {object}
   */
  getAllLimits() {
    return { ...API_RATE_LIMITS };
  }
}

/** Singleton instance — shared across all fetchers. */
const rateLimiter = new RateLimiterService();
export default rateLimiter;

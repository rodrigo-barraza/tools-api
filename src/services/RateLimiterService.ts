// ─── Rate Limiter Service ───────────────────────────────────

import { API_RATE_LIMITS } from "../constants.ts";
import logger from "../logger.ts";

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
   */
  async wait(provider: any) {
    const limits = API_RATE_LIMITS[provider as keyof typeof API_RATE_LIMITS];
    if (!limits) {
      logger.warn(`[RateLimiter] ⚠️ Unknown provider: ${provider}`);
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


   */
  async #enforce(provider: any, delayMs: any) {
    const last = this.#lastRequestAt.get(provider) || 0;
    const elapsed = Date.now() - last;
    const remaining = delayMs - elapsed;

    if (remaining > 0) {
      await new Promise<any>((resolve: any) => setTimeout(resolve, remaining));
    }

    this.#lastRequestAt.set(provider, Date.now());
  }

  /**
   * Get the configured delay for a provider (useful for logging/diagnostics).

   */
  getDelay(provider: any) {
    return API_RATE_LIMITS[provider as keyof typeof API_RATE_LIMITS]?.requestDelayMs ?? null;
  }

  /**
   * Get current usage stats for a provider.

   */
  getStats(provider: any) {
    return {
      lastRequestAt: this.#lastRequestAt.get(provider) ?? null,
      delayMs: this.getDelay(provider),
    };
  }

  /**
   * Get all rate limit definitions (for admin/status endpoints).

   */
  getAllLimits() {
    return { ...API_RATE_LIMITS };
  }
}

/** Singleton instance — shared across all fetchers. */
const rateLimiter = new RateLimiterService();
export default rateLimiter;

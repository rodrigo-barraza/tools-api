import { saveState, loadState } from "../models/CollectorSnapshot.ts";
import logger from "../logger.ts";
import type { CollectorTask } from "../types/agentic.ts";

// ═══════════════════════════════════════════════════════════════
//  Freshness Service — Cache-Aside Staleness Check
// ═══════════════════════════════════════════════════════════════
// Each collector stores its latest state in a dedicated MongoDB
// collection. On startup, checks that collection for freshness.
// If fresh → restore from DB. If stale → fetch from API.
// ═══════════════════════════════════════════════════════════════

/**
 * Conditionally execute a collector function only if the data is stale.
 * If data is fresh, restores the in-memory cache from the DB.
 */
export async function collectIfStale(
  label: string,
  collection: string,
  ttlMs: number,
  collectFn: () => Promise<void>,
  restoreFn: (data: never) => void,
) {
  const state = await loadState(collection);

  if (state) {
    const ageMs = Date.now() - new Date(state.updatedAt).getTime();

    if (ageMs < ttlMs) {
      const ageMinutes = Math.round(ageMs / 60_000);
      const ttlMinutes = Math.round(ttlMs / 60_000);
      (restoreFn as (data: unknown) => void)(state.data);
      logger.info(
        `[${label}] ♻️  Restored from DB (${ageMinutes}m old, TTL: ${ttlMinutes}m)`,
      );
      return false;
    }

    const ageMinutes = Math.round(ageMs / 60_000);
    logger.info(
      `[${label}] 🔄 Stale data in DB (${ageMinutes}m old) — refreshing`,
    );
  } else {
    logger.info(`[${label}] 🆕 No data in DB — initial fetch`);
  }

  await collectFn();
  return true;
}

/**
 * Start a set of collectors from a declarative task array.
 * Handles initial stale check with staggered delays, then sets up intervals.
 * Eliminates the need to manually write setInterval lines per collector.
 */
export function startCollectorLoop(tasks: CollectorTask<never>[]) {
  for (const task of tasks) {
    setTimeout(
      () =>
        collectIfStale(
          task.label,
          task.collection,
          task.ttl,
          task.collectFn,
          task.restoreFn,
        ),
      task.delay || 0,
    );
    setInterval(
      () =>
        collectIfStale(
          task.label,
          task.collection,
          task.ttl,
          task.collectFn,
          task.restoreFn,
        ),
      task.ttl,
    );
  }
}

// Re-export saveState for collectors to call after each fetch
export { saveState };

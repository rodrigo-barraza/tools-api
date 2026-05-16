import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache({ type: "array", itemsKey: "warnings" });

export const updateWarnings = cache.update;
export const setWarningError = cache.setError;
export const getWarnings = cache.get;
export const getWarningHealth = cache.getHealth;

/** Get warning counts broken down by type. */
export function getWarningCount() {
  const warnings = cache.getData();
  return {
    total: warnings.length,
    byType: {
      warning: warnings.filter((w) => w.type === "warning").length,
      watch: warnings.filter((w) => w.type === "watch").length,
      advisory: warnings.filter((w) => w.type === "advisory").length,
      statement: warnings.filter((w) => w.type === "statement").length,
    },
    lastFetch: cache.getLastFetch(),
  };
}

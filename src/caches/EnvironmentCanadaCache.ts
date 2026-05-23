import { createSimpleCache } from "./createSimpleCache.ts";

const cache = createSimpleCache<any>({ type: "array", itemsKey: "warnings" });

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
      warning: warnings.filter((w: { type: string }) => w.type === "warning").length,
      watch: warnings.filter((w: { type: string }) => w.type === "watch").length,
      advisory: warnings.filter((w: { type: string }) => w.type === "advisory").length,
      statement: warnings.filter((w: { type: string }) => w.type === "statement").length,
    },
    lastFetch: cache.getLastFetch(),
  };
}

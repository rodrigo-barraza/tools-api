import { createSimpleCache } from "./createSimpleCache.ts";
import { type CanadaWarning } from "../fetchers/weather/EnvironmentCanadaFetcher.ts";

const cache = createSimpleCache<CanadaWarning[]>({ type: "array", itemsKey: "warnings" });

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
      warning: warnings.filter((warning) => warning.type === "warning").length,
      watch: warnings.filter((warning) => warning.type === "watch").length,
      advisory: warnings.filter((warning) => warning.type === "advisory").length,
      statement: warnings.filter((warning) => warning.type === "statement").length,
    },
    lastFetch: cache.getLastFetch(),
  };
}

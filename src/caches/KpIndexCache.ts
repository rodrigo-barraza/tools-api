import { createSimpleCache } from "./createSimpleCache.ts";
import { MS_PER_DAY } from "@rodrigo-barraza/utilities-library";
import { KP_STORM_SCALE } from "../constants.ts";

const cache = createSimpleCache<any>({ type: "array", itemsKey: "readings" });

export const updateKpIndex = cache.update;
export const setKpIndexError = cache.setError;

/**
 * Classify a Kp value into its storm scale level.
 */
function classifyKp(kp: any) {
  const entry = KP_STORM_SCALE.find((s: any) => kp >= s.min && kp < s.max);
  return entry || { level: "Unknown", storm: null };
}

/**
 * Get the full 7-day Kp history.
 */
export function getKpHistory() {
  return cache.get();
}

/**
 * Get the current (latest) Kp reading with storm classification.
 */
export function getCurrentKp() {
  const readings = cache.getData();
  const latest = readings[readings.length - 1] || null;
  if (!latest) {
    return {
      current: null as any,
      classification: null as any,
      lastFetch: cache.getLastFetch(),
    };
  }

  const classification = classifyKp(latest.kp);

  // Find peak in last 24 hours
  const dayAgo = new Date(Date.now() - MS_PER_DAY);
  const last24h = readings.filter((r: any) => r.time >= dayAgo);
  const peak = last24h.reduce(
    (max: any, r: any) => (r.kp > (max?.kp ?? -1) ? r : max),
    null,
  );

  return {
    current: latest,
    classification,
    peak24h: peak,
    peakClassification: peak ? classifyKp(peak.kp) : null as any,
    lastFetch: cache.getLastFetch(),
  };
}

export function getKpHealth() {
  return cache.getHealth();
}

import { createSimpleCache } from "./createSimpleCache.ts";
import { MILLISECONDS_PER_DAY } from "@rodrigo-barraza/utilities-library";
import { KP_STORM_SCALE } from "../constants.ts";
import { type KpReading } from "../types/weather.ts";

const cache = createSimpleCache<KpReading[]>({
  type: "array",
  itemsKey: "readings",
});

export const updateKpIndex = cache.update;
export const setKpIndexError = cache.setError;

interface KpStormScale {
  level: string;
  storm: string | null;
  min: number;
  max: number;
}

interface KpClassification {
  level: string;
  storm: string | null;
}

/**
 * Classify a Kp value into its storm scale level.
 */
function classifyKp(kp: number): KpClassification {
  const entry = (KP_STORM_SCALE as KpStormScale[]).find(
    (s) => kp >= s.min && kp < s.max,
  );
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
      current: null as KpReading | null,
      classification: null as KpClassification | null,
      lastFetch: cache.getLastFetch(),
    };
  }

  const classification = classifyKp(latest.kp);

  // Find peak in last 24 hours
  const dayAgo = new Date(Date.now() - MILLISECONDS_PER_DAY);
  const last24h = readings.filter((r) => new Date(r.time) >= dayAgo);
  const peak = last24h.reduce<KpReading | null>(
    (max, r) => (r.kp > (max?.kp ?? -1) ? r : max),
    null,
  );

  return {
    current: latest,
    classification,
    peak24h: peak,
    peakClassification: peak ? classifyKp(peak.kp) : null,
    lastFetch: cache.getLastFetch(),
  };
}

export function getKpHealth() {
  return cache.getHealth();
}

import { upsertSolarFlares } from "../models/SolarFlare.ts";
import { upsertCmes } from "../models/Cme.ts";
import { upsertGeomagneticStorms } from "../models/GeomagneticStorm.ts";
import { SOLAR_FLARE_CLASSES } from "../constants.ts";
import {
  type SolarFlare,
  type Cme,
  type GeomagneticStorm,
} from "../fetchers/weather/DonkiFetcher.ts";

interface CacheError {
  message: string;
  time: string;
}

interface SpaceWeatherData {
  flares: SolarFlare[];
  cmes: Cme[];
  storms: GeomagneticStorm[];
}

const cache: {
  flares: SolarFlare[];
  cmes: Cme[];
  storms: GeomagneticStorm[];
  lastFetch: Date | null;
  error: CacheError | null;
} = {
  flares: [],
  cmes: [],
  storms: [],
  lastFetch: null,
  error: null,
};

/**
 * Update all space weather caches and persist to DB.
 */
export async function updateSpaceWeather({
  flares,
  cmes,
  storms,
}: SpaceWeatherData) {
  cache.flares = flares;
  cache.cmes = cmes;
  cache.storms = storms;
  cache.lastFetch = new Date();
  cache.error = null;

  const [flrResult, cmeResult, gstResult] = await Promise.all([
    upsertSolarFlares(flares),
    upsertCmes(cmes),
    upsertGeomagneticStorms(storms),
  ]);

  return { flares: flrResult, cmes: cmeResult, storms: gstResult };
}

export function setSpaceWeatherError(error: { message: string }) {
  cache.error = { message: error.message, time: new Date().toISOString() };
}

/**
 * Restore space weather data from a DB snapshot.
 * Memory-only — no MongoDB upserts.
 */
export function restoreSpaceWeather({
  flares,
  cmes,
  storms,
}: Partial<SpaceWeatherData>) {
  cache.flares = flares || [];
  cache.cmes = cmes || [];
  cache.storms = storms || [];
  cache.lastFetch = new Date();
  cache.error = null;
}

export function getLatestFlares() {
  return [...cache.flares];
}

export function getLatestCmes() {
  return [...cache.cmes];
}

export function getLatestStorms() {
  return [...cache.storms];
}

/**
 * Get all space weather data from cache.
 */
export function getLatestSpaceWeather() {
  return {
    flares: cache.flares,
    cmes: cache.cmes,
    storms: cache.storms,
    lastFetch: cache.lastFetch,
  };
}

/**
 * Summary: strongest flare, fastest CME, Earth-directed CMEs, storm count.
 */
export function getSpaceWeatherSummary() {
  // Find strongest flare by class
  const strongestFlare = cache.flares.reduce(
    (strongest: SolarFlare | null, flr: SolarFlare) => {
      if (!strongest) return flr;
      const currentClass = flr.classType?.[0] || "";
      const bestClass = strongest.classType?.[0] || "";
      const currentIndex = SOLAR_FLARE_CLASSES.indexOf(currentClass);
      const bestIndex = SOLAR_FLARE_CLASSES.indexOf(bestClass);
      if (currentIndex > bestIndex) return flr;
      if (currentIndex === bestIndex) {
        const currentNumber = parseFloat(flr.classType?.slice(1) || "0");
        const bestNumber = parseFloat(strongest.classType?.slice(1) || "0");
        return currentNumber > bestNumber ? flr : strongest;
      }
      return strongest;
    },
    null,
  );

  const fastestCme = cache.cmes.reduce(
    (fastest: Cme | null, cme: Cme) =>
      (cme.speed ?? 0) > (fastest?.speed ?? 0) ? cme : fastest,
    null,
  );

  const earthDirectedCmes = cache.cmes.filter((cme: Cme) => cme.isEarthDirected);

  return {
    flareCount: cache.flares.length,
    cmeCount: cache.cmes.length,
    stormCount: cache.storms.length,
    strongestFlare,
    fastestCme,
    earthDirectedCmes: earthDirectedCmes.length,
    earthDirectedDetails: earthDirectedCmes,
    lastFetch: cache.lastFetch,
  };
}

export function getSpaceWeatherHealth() {
  return {
    lastFetch: cache.lastFetch,
    error: cache.error,
    flareCount: cache.flares.length,
    cmeCount: cache.cmes.length,
    stormCount: cache.storms.length,
  };
}

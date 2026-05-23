import { createSimpleCache } from "./createSimpleCache.ts";

export interface TwilightResponse {
  sunrise: string;
  sunset: string;
  solarNoon: string;
  dayLength: number | string;
  civilTwilightBegin: string;
  civilTwilightEnd: string;
  nauticalTwilightBegin: string;
  nauticalTwilightEnd: string;
  astronomicalTwilightBegin: string;
  astronomicalTwilightEnd: string;
}

const cache = createSimpleCache<TwilightResponse>();

export const updateTwilight = cache.update;
export const setTwilightError = cache.setError;
export const getTwilight = cache.get;
export const getTwilightHealth = cache.getHealth;

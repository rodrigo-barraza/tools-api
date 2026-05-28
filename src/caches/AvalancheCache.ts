import { createSimpleCache } from "./createSimpleCache.ts";
import { type AvalancheForecast } from "../fetchers/weather/AvalancheFetcher.ts";

const cache = createSimpleCache<AvalancheForecast[]>({
  type: "array",
  itemsKey: "forecasts",
});

export const updateAvalanche = cache.update;
export const setAvalancheError = cache.setError;
export const getAvalanche = cache.get;
export const getAvalancheHealth = cache.getHealth;

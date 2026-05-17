import { createSimpleCache } from "./createSimpleCache.ts";

const cache = createSimpleCache<any>({ type: "array", itemsKey: "forecasts" });

export const updateAvalanche = cache.update;
export const setAvalancheError = cache.setError;
export const getAvalanche = cache.get;
export const getAvalancheHealth = cache.getHealth;

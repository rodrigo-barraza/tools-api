import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache({ type: "array", itemsKey: "forecasts" });

export const updateAvalanche = cache.update;
export const setAvalancheError = cache.setError;
export const getAvalanche = cache.get;
export const getAvalancheHealth = cache.getHealth;

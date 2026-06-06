import { createSimpleCache } from "./createSimpleCache.ts";
import type { MoonPhaseResult } from "../utilities/MoonPhaseCalculator.ts";

const cache = createSimpleCache<MoonPhaseResult>();

export const updateMoonPhase = cache.update;
export const setMoonPhaseError = cache.setError;
export const getMoonPhase = cache.get;
export const getMoonPhaseHealth = cache.getHealth;

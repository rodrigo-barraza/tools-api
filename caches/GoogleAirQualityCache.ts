import { createSimpleCache } from "./createSimpleCache.ts";

const { update, setError, get, getHealth } = createSimpleCache<any>();

export {
  update as updateGoogleAirQuality,
  setError as setGoogleAirQualityError,
  get as getGoogleAirQuality,
  getHealth as getGoogleAirQualityHealth,
};

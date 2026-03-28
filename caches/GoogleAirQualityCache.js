import { createSimpleCache } from "./createSimpleCache.js";

const { update, setError, get, getHealth } = createSimpleCache();

export {
  update as updateGoogleAirQuality,
  setError as setGoogleAirQualityError,
  get as getGoogleAirQuality,
  getHealth as getGoogleAirQualityHealth,
};

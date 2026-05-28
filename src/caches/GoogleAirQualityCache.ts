import { createSimpleCache } from "./createSimpleCache.ts";
import { GoogleAirQuality } from "../types/weather.ts";

const { update, setError, get, getHealth } =
  createSimpleCache<GoogleAirQuality>();

export {
  update as updateGoogleAirQuality,
  setError as setGoogleAirQualityError,
  get as getGoogleAirQuality,
  getHealth as getGoogleAirQualityHealth,
};

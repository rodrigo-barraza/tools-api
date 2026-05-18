import { MS_PER_DAY } from "@rodrigo-barraza/utilities-library";
import { getWebcamsByCity, getWebcamsLastUpdated } from "../../models/Webcam.ts";
import { WEBCAM_REGISTRY, getSupportedCities } from "./webcams/WebcamRegistry.ts";
import logger from "../../logger.ts";

export async function getPublicWebcams({ city = "vancouver", limit = 100 }: Record<string, any> = {}) {
  const normalizedCity = city.toLowerCase();

  const supportedCities = getSupportedCities();
  if (!supportedCities.includes(normalizedCity)) {
    throw new Error(`Webcams for city '${city}' are not currently supported. Supported: ${supportedCities.join(", ")}`);
  }

  const capitalizedCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();

  const lastUpdated = await getWebcamsLastUpdated(capitalizedCity);
  const isStale = !lastUpdated || (Date.now() - lastUpdated.getTime()) > MS_PER_DAY;

  if (isStale) {
    logger.info(`📷 Refreshing webcam data for ${capitalizedCity}`);
    try {
      // @ts-expect-error - TS7053: implicit any index
      const refreshFunction = WEBCAM_REGISTRY[normalizedCity];
      if (refreshFunction) {
        await refreshFunction();
      }
    } catch (error: any) {
      logger.error(`Failed to refresh webcams for ${capitalizedCity}:`, error.message);
      // If we never had them, we can't fallback to DB, so we throw
      if (!lastUpdated) throw error;
    }
  }

  // Return the webcams directly from the database
  return getWebcamsByCity(capitalizedCity, limit);
}

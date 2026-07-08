import { MILLISECONDS_PER_DAY } from "@rodrigo-barraza/utilities-library";
import {
  getWebcams,
  getWebcamsLastUpdatedByKey,
} from "../../models/Webcam.ts";
import {
  WEBCAM_REGISTRY,
} from "./webcams/WebcamRegistry.ts";
import {
  WEBCAM_METADATA_LIST,
  COUNTRY_NAME_TO_CODE,
} from "./webcams/WebcamMetadata.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

export interface WebcamOptions {
  city?: string;
  state?: string;
  province?: string;
  region?: string;
  country?: string;
  limit?: number;
}

function normalizeGeo(str: string): string {
  return str.toLowerCase().replace(/-/g, " ").trim();
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getPublicWebcams({
  city,
  state,
  province,
  region,
  country,
  limit = 100,
}: WebcamOptions = {}) {
  const hasFilter = city || state || province || region || country;
  const activeCity = !hasFilter ? "vancouver" : city;

  // 1. Identify matched source keys based on query criteria
  const matchedKeys: string[] = [];
  
  const normCountry = country ? country.toLowerCase().trim() : undefined;
  const countryCode = normCountry ? (COUNTRY_NAME_TO_CODE[normCountry] || country!.toUpperCase().trim()) : undefined;

  const normCity = activeCity ? normalizeGeo(activeCity) : undefined;
  const normState = state ? normalizeGeo(state) : undefined;
  const normProvince = province ? normalizeGeo(province) : undefined;
  const normRegion = region ? normalizeGeo(region) : undefined;

  for (const meta of WEBCAM_METADATA_LIST) {
    let matches = true;
    if (countryCode && meta.country !== countryCode) matches = false;
    
    if (normCity) {
      const matchesCity = (meta.city && normalizeGeo(meta.city) === normCity) || normalizeGeo(meta.key) === normCity;
      if (!matchesCity) matches = false;
    }
    if (normState) {
      const matchesState = (meta.state && normalizeGeo(meta.state) === normState) || normalizeGeo(meta.key) === normState;
      if (!matchesState) matches = false;
    }
    if (normProvince) {
      const matchesProvince = (meta.province && normalizeGeo(meta.province) === normProvince) || normalizeGeo(meta.key) === normProvince;
      if (!matchesProvince) matches = false;
    }
    if (normRegion) {
      const matchesRegion = (meta.region && normalizeGeo(meta.region) === normRegion) || normalizeGeo(meta.key) === normRegion;
      if (!matchesRegion) matches = false;
    }

    if (matches) {
      matchedKeys.push(meta.key);
    }
  }

  // If a filter was provided but nothing matched, throw a clear error
  if (hasFilter && matchedKeys.length === 0) {
    const filters = Object.entries({ city, state, province, region, country })
      .filter(([_, v]) => !!v)
      .map(([k, v]) => `${k}='${v}'`)
      .join(", ");
    throw new Error(`No supported public webcam sources matched filters: ${filters}`);
  }

  // 2. Refresh stale matched keys
  for (const key of matchedKeys) {
    const lastUpdated = await getWebcamsLastUpdatedByKey(key);
    const isStale =
      !lastUpdated || Date.now() - lastUpdated.getTime() > MILLISECONDS_PER_DAY;

    if (isStale) {
      logger.info(`📷 Refreshing webcam data for source key: ${key}`);
      try {
        const refreshFunction = WEBCAM_REGISTRY[key as keyof typeof WEBCAM_REGISTRY];
        if (refreshFunction) {
          await refreshFunction();
        }
      } catch (error: unknown) {
        logger.error(`Failed to refresh webcams for source key ${key}:`, errorMessage(error));
        // If we have no cached data at all for this specific source, and it's the only one, throw.
        // Otherwise, skip individual failures so we can return other cached results.
        if (!lastUpdated && matchedKeys.length === 1) {
          throw error;
        }
      }
    }
  }

  // 3. Build MongoDB query
  const dbQuery: Record<string, unknown> = {};
  if (activeCity) {
    dbQuery.city = { $regex: new RegExp(`^${escapeRegExp(activeCity)}$`, "i") };
  }
  if (state) {
    dbQuery.state = { $regex: new RegExp(`^${escapeRegExp(state)}$`, "i") };
  }
  if (province) {
    dbQuery.province = { $regex: new RegExp(`^${escapeRegExp(province)}$`, "i") };
  }
  if (region) {
    dbQuery.region = { $regex: new RegExp(`^${escapeRegExp(region)}$`, "i") };
  }
  if (countryCode) {
    dbQuery.country = countryCode;
  }

  return getWebcams(dbQuery, limit);
}


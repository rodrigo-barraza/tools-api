import rateLimiter from "../../services/RateLimiterService.ts";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// ─── Types ──────────────────────────────────────────────────────

export interface GeocodeResult {
  name: string;
  country: string;
  countryCode: string;
  admin1: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation: number | null;
  population: number | null;
}

interface RawGeocodeResult {
  name: string;
  country: string;
  country_code: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
  population?: number;
}

interface RawGeocodeResponse {
  results?: RawGeocodeResult[];
}

// ─── Geocoding ──────────────────────────────────────────────────

/**
 * Geocode a location string to lat/lon using Open-Meteo's free geocoding API.
 * No API key required. Returns null if the location cannot be resolved.
 */
export async function geocodeLocation(
  location: string,
): Promise<GeocodeResult | null> {
  await rateLimiter.wait("OPEN_METEO");

  const url = `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding API returned ${response.status}`);
  }

  const data = (await response.json()) as RawGeocodeResponse;
  if (!data.results || data.results.length === 0) {
    return null;
  }

  const locationResult = data.results[0];
  return {
    name: locationResult.name,
    country: locationResult.country,
    countryCode: locationResult.country_code,
    admin1: locationResult.admin1 || null,
    latitude: locationResult.latitude,
    longitude: locationResult.longitude,
    timezone: locationResult.timezone,
    elevation: locationResult.elevation || null,
    population: locationResult.population || null,
  };
}

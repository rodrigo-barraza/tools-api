/**
 * Utility Domain TypeScript Definitions
 */

// ─── Webcam Types ──────────────────────────────────────────────────

export interface WebcamSource {
  id?: string;
  name: string;
  url: string;
  city: string;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isLive?: boolean;
  status?: string | null;
  provider?: string | null;
  sourceUrl?: string | null;
  fetchedAt?: Date;
}

// ─── Airport Types ─────────────────────────────────────────────────

export interface AirportInfo {
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  city: string | null;
  country_code: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_ft: number | null;
  type: string | null;
  scheduled_service: string | null;
  [key: string]: string | number | null | undefined;
}

export interface FormattedAirport {
  iataCode: string | null;
  icaoCode: string | null;
  name: string;
  city: string | null;
  countryCode: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  elevationFt: number | null;
  type: string | null;
  scheduledService: string | null;
  distanceKm?: number;
}

// ─── IP Geolocation Types ──────────────────────────────────────────

export interface IpInfo {
  ip: string;
  hostname: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  org: string | null;
  postal: string | null;
  timezone: string | null;
  fetchedAt: string;
  error?: string;
}

// ─── Currency Types ───────────────────────────────────────────────

export interface CurrencyRate {
  base: string;
  date: string;
  rates: Record<string, number>;
}

// ─── Place Search Types ────────────────────────────────────────────

export interface Place {
  id: string;
  name: string;
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  rating?: number | null;
  userRatingsTotal?: number | null;
  types?: string[];
  phoneNumber?: string | null;
  website?: string | null;
  openNow?: boolean | null;
  weekdayText?: string[];
}

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import { AirportInfo, FormattedAirport } from "../../types/utility.ts";
import { errorMessage } from "../../utilities.ts";

/**
 * Airport Fetcher — Static In-Memory Airport Database
 *
 * Loads ~4,500 medium/large airports with IATA codes into memory.
 * Provides search, exact lookup, country filtering, and nearest-airport
 * queries via Haversine distance calculation.
 *
 * Source: OurAirports (Public Domain)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CSV Parser ────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Haversine ─────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const VALUE = 6371;
  const toRad = (data: number) => (data * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const haversineA =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return VALUE * 2 * Math.atan2(Math.sqrt(haversineA), Math.sqrt(1 - haversineA));
}

// ─── Load & Index ──────────────────────────────────────────────

const AIRPORT_DB: AirportInfo[] = [];
let loaded = false;

export function ensureLoaded(): void {
  if (loaded) return;

  try {
    const csvPath = join(__dirname, "data", "digest_airports.csv");
    const raw = readFileSync(csvPath, "utf-8");
    const lines = raw.split("\n").filter((line: string) => line.trim());
    if (lines.length === 0) return;
    const headers = parseCSVLine(lines[0]);

    const NUMERIC_FIELDS = new Set(["latitude", "longitude", "elevation_ft"]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 5) continue;

      const row: AirportInfo = {
        iata_code: null,
        icao_code: null,
        name: "",
        city: null,
        country_code: null,
        continent: null,
        latitude: null,
        longitude: null,
        elevation_ft: null,
        type: null,
        scheduled_service: null,
      };

      headers.forEach((header: string, index: number) => {
        const value = values[index] || "";
        if (NUMERIC_FIELDS.has(header)) {
          const parsedNumber = parseFloat(value);
          row[header] = isNaN(parsedNumber) ? null : parsedNumber;
        } else {
          row[header] = value || null;
        }
      });

      AIRPORT_DB.push(row);
    }
  } catch (error) {
    logger.error(`Failed to load airport database: ${errorMessage(error)}`);
    throw error;
  }

  logger.info(`✈️  Airport database loaded: ${AIRPORT_DB.length} airports`);
  loaded = true;
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(searchText: string): string {
  return searchText.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatAirport(ap: AirportInfo): FormattedAirport {
  return {
    iataCode: ap.iata_code,
    icaoCode: ap.icao_code,
    name: ap.name,
    city: ap.city,
    countryCode: ap.country_code,
    continent: ap.continent,
    latitude: ap.latitude,
    longitude: ap.longitude,
    elevationFt: ap.elevation_ft,
    type: ap.type,
    scheduledService: ap.scheduled_service,
  };
}

// ─── Public API ────────────────────────────────────────────────

export interface SearchAirportsOptions {
  limit?: number;
  country?: string;
}

export interface SearchAirportsResult {
  count: number;
  query: string | null | undefined;
  note: string;
  airports: FormattedAirport[];
}

/**
 * Search airports by name, IATA code, city, or country.
 */
export function searchAirports(
  query: string | null | undefined,
  opts: SearchAirportsOptions = {},
): SearchAirportsResult {
  ensureLoaded();

  const { limit = 10, country } = opts;
  const normalizedQuery = normalizeSearch(query || "");

  if (!normalizedQuery)
    return { count: 0, query, note: "No query provided.", airports: [] };

  let candidates = AIRPORT_DB;
  if (country) {
    const normalizedCountry = country.toUpperCase();
    candidates = candidates.filter(
      (airport: AirportInfo) =>
        airport.country_code &&
        airport.country_code.toUpperCase() === normalizedCountry,
    );
  }

  const scored = candidates
    .map((airport: AirportInfo) => {
      let score = 0;
      const iata = (airport.iata_code || "").toLowerCase();
      const icao = (airport.icao_code || "").toLowerCase();
      const name = normalizeSearch(airport.name || "");
      const city = normalizeSearch(airport.city || "");

      if (iata === normalizedQuery) score += 100;
      else if (icao === normalizedQuery) score += 95;
      else if (city === normalizedQuery) score += 80;
      else if (name === normalizedQuery) score += 75;
      else if (iata.startsWith(normalizedQuery)) score += 60;
      else if (city.startsWith(normalizedQuery)) score += 50;
      else if (name.includes(normalizedQuery)) score += 30;
      else if (city.includes(normalizedQuery)) score += 25;

      // Boost large airports
      if (airport.type === "large_airport") score += 5;

      return { airport, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((agent, b) => b.score - agent.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from OurAirports (Public Domain). Medium and large airports with IATA codes.",
    airports: scored.map((entry) => formatAirport(entry.airport)),
  };
}

/**
 * Get airport by exact IATA code.
 */
export function getAirportByCode(code: string): FormattedAirport | null {
  ensureLoaded();

  const normalizedCode = code.toUpperCase().trim();
  const airport =
    AIRPORT_DB.find(
      (airportEntry: AirportInfo) =>
        airportEntry.iata_code &&
        airportEntry.iata_code.toUpperCase() === normalizedCode,
    ) ||
    AIRPORT_DB.find(
      (airportEntry: AirportInfo) =>
        airportEntry.icao_code &&
        airportEntry.icao_code.toUpperCase() === normalizedCode,
    );

  if (!airport) return null;
  return formatAirport(airport);
}

export interface GetAirportsByCountryOptions {
  limit?: number;
}

export interface GetAirportsByCountryResult {
  countryCode: string;
  count: number;
  note: string;
  airports: FormattedAirport[];
}

/**
 * Get all airports in a country.
 */
export function getAirportsByCountry(
  countryCode: string,
  opts: GetAirportsByCountryOptions = {},
): GetAirportsByCountryResult {
  ensureLoaded();

  const { limit = 50 } = opts;
  const normalizedCountryCode = countryCode.toUpperCase().trim();

  const airports = AIRPORT_DB.filter(
    (airport: AirportInfo) =>
      airport.country_code &&
      airport.country_code.toUpperCase() === normalizedCountryCode,
  )
    .sort((airportInfo: AirportInfo, b: AirportInfo) => {
      // Large airports first
      if (airportInfo.type === "large_airport" && b.type !== "large_airport") return -1;
      if (b.type === "large_airport" && airportInfo.type !== "large_airport") return 1;
      return (airportInfo.name || "").localeCompare(b.name || "");
    })
    .slice(0, limit);

  return {
    countryCode: normalizedCountryCode,
    count: airports.length,
    note: "Data from OurAirports (Public Domain).",
    airports: airports.map(formatAirport),
  };
}

export interface GetNearestAirportsOptions {
  limit?: number;
}

export interface GetNearestAirportsResult {
  latitude: number;
  longitude: number;
  count: number;
  note: string;
  airports: FormattedAirport[];
}

/**
 * Find nearest airports to a coordinate.
 */
export function getNearestAirports(
  lat: number,
  lng: number,
  opts: GetNearestAirportsOptions = {},
): GetNearestAirportsResult {
  ensureLoaded();

  const { limit = 5 } = opts;

  const withDist = AIRPORT_DB.filter(
    (airport: AirportInfo) =>
      airport.latitude !== null && airport.longitude !== null,
  ).map((airport: AirportInfo) => ({
    airport,
    distanceKm: haversineKm(
      lat,
      lng,
      airport.latitude as number,
      airport.longitude as number,
    ),
  }));

  withDist.sort((agent, b) => agent.distanceKm - b.distanceKm);
  const nearest = withDist.slice(0, limit);

  return {
    latitude: lat,
    longitude: lng,
    count: nearest.length,
    note: "Distance calculated via Haversine formula. Data from OurAirports.",
    airports: nearest.map((nearestEntry) => ({
      ...formatAirport(nearestEntry.airport),
      distanceKm: Math.round(nearestEntry.distanceKm * 10) / 10,
    })),
  };
}

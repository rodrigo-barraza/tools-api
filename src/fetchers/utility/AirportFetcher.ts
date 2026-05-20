import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";

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

function parseCSVLine(line: any) {
  const fields: any[] = [];
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
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Haversine ─────────────────────────────────────────────────

function haversineKm(lat1: any, lon1: any, lat2: any, lon2: any) {
  const R = 6371;
  const toRad = (d: any) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Load & Index ──────────────────────────────────────────────

const AIRPORT_DB: any[] = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  const csvPath = join(__dirname, "data", "digest_airports.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l: any) => l.trim());
  const headers = parseCSVLine(lines[0]);

  const NUMERIC_FIELDS = new Set([
    "latitude",
    "longitude",
    "elevation_ft",
  ]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 5) continue;

    const row: Record<string, any> = {};
    headers.forEach((h: any, index: any) => {
      const value = values[index] || "";
      if (NUMERIC_FIELDS.has(h)) {
        const parsedNumber = parseFloat(value);
        row[h] = isNaN(parsedNumber) ? null : num;
      } else {
        row[h] = value || null;
      }
    });

    AIRPORT_DB.push(row);
  }

  logger.info(`✈️  Airport database loaded: ${AIRPORT_DB.length} airports`);
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(str: any) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatAirport(ap: any) {
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

/**
 * Search airports by name, IATA code, city, or country.
 */
export function searchAirports(query: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, country } = opts;
  const q = normalizeSearch(query);

  if (!q) return { count: 0, query, airports: [] };

  let candidates = AIRPORT_DB;
  if (country) {
    const c = country.toUpperCase();
    candidates = candidates.filter(
      (a: any) => a.country_code && a.country_code.toUpperCase() === c,
    );
  }

  const scored = candidates
    .map((ap: any) => {
      let score = 0;
      const iata = (ap.iata_code || "").toLowerCase();
      const icao = (ap.icao_code || "").toLowerCase();
      const name = normalizeSearch(ap.name || "");
      const city = normalizeSearch(ap.city || "");

      if (iata === q) score += 100;
      else if (icao === q) score += 95;
      else if (city === q) score += 80;
      else if (name === q) score += 75;
      else if (iata.startsWith(q)) score += 60;
      else if (city.startsWith(q)) score += 50;
      else if (name.includes(q)) score += 30;
      else if (city.includes(q)) score += 25;

      // Boost large airports
      if (ap.type === "large_airport") score += 5;

      return { ap, score };
    })
    .filter((s: any) => s.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from OurAirports (Public Domain). Medium and large airports with IATA codes.",
    airports: scored.map((s: any) => formatAirport(s.ap)),
  };
}

/**
 * Get airport by exact IATA code.
 */
export function getAirportByCode(code: any) {
  ensureLoaded();

  const c = code.toUpperCase().trim();
  const ap =
    AIRPORT_DB.find(
      (a: any) => a.iata_code && a.iata_code.toUpperCase() === c,
    ) ||
    AIRPORT_DB.find(
      (a: any) => a.icao_code && a.icao_code.toUpperCase() === c,
    );

  if (!ap) return null;
  return formatAirport(ap);
}

/**
 * Get all airports in a country.
 */
export function getAirportsByCountry(countryCode: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 50 } = opts;
  const c = countryCode.toUpperCase().trim();

  const airports = AIRPORT_DB.filter(
    (a: any) => a.country_code && a.country_code.toUpperCase() === c,
  )
    .sort((a: any, b: any) => {
      // Large airports first
      if (a.type === "large_airport" && b.type !== "large_airport") return -1;
      if (b.type === "large_airport" && a.type !== "large_airport") return 1;
      return (a.name || "").localeCompare(b.name || "");
    })
    .slice(0, limit);

  return {
    countryCode: c,
    count: airports.length,
    note: "Data from OurAirports (Public Domain).",
    airports: airports.map(formatAirport),
  };
}

/**
 * Find nearest airports to a coordinate.
 */
export function getNearestAirports(lat: any, lng: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 5 } = opts;

  const withDist = AIRPORT_DB.filter(
    (a: any) => a.latitude !== null && a.longitude !== null,
  ).map((a: any) => ({
    airport: a,
    distanceKm: haversineKm(lat, lng, a.latitude, a.longitude),
  }));

  withDist.sort((a: any, b: any) => a.distanceKm - b.distanceKm);
  const nearest = withDist.slice(0, limit);

  return {
    latitude: lat,
    longitude: lng,
    count: nearest.length,
    note: "Distance calculated via Haversine formula. Data from OurAirports.",
    airports: nearest.map((n: any) => ({
      ...formatAirport(n.airport),
      distanceKm: Math.round(n.distanceKm * 10) / 10,
    })),
  };
}

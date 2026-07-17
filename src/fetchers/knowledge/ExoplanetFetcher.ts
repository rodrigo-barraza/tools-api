import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import { ExoplanetRecord, FormattedPlanet } from "../../types/knowledge.ts";

/**
 * Exoplanet Fetcher — Static In-Memory NASA Exoplanet Archive Database
 *
 * Loads ~6,100 confirmed exoplanets from the NASA Exoplanet Archive into memory.
 * Provides search, name lookup, discovery method statistics, habitability
 * zone filtering, and ranking by mass/radius/temperature.
 *
 * Source: NASA Exoplanet Archive (Public Domain)
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

// ─── Load & Index ──────────────────────────────────────────────

const PLANET_DB: ExoplanetRecord[] = [];
let loaded = false;

const FIELD_META = {
  pl_orbper: { label: "Orbital Period", unit: "days" },
  pl_rade: { label: "Planet Radius", unit: "Earth radii" },
  pl_bmasse: { label: "Planet Mass", unit: "Earth masses" },
  pl_orbsmax: { label: "Semi-major Axis", unit: "AU" },
  pl_orbeccen: { label: "Orbital Eccentricity", unit: "" },
  pl_eqt: { label: "Equilibrium Temperature", unit: "K" },
  sy_vmag: { label: "V-band Magnitude", unit: "mag" },
  st_mass: { label: "Stellar Mass", unit: "Solar masses" },
  st_rad: { label: "Stellar Radius", unit: "Solar radii" },
  st_teff: { label: "Stellar Eff. Temperature", unit: "K" },
  sy_dist: { label: "Distance", unit: "parsecs" },
};

export type ExoplanetField = keyof typeof FIELD_META;

const NUMERIC_FIELDS = new Set([
  "disc_year",
  "pl_orbper",
  "pl_rade",
  "pl_bmasse",
  "pl_orbsmax",
  "pl_orbeccen",
  "pl_eqt",
  "sy_vmag",
  "st_mass",
  "st_rad",
  "st_teff",
  "sy_dist",
  "ra",
  "dec",
]);

export function ensureLoaded() {
  if (loaded) return;

  const csvPath = join(__dirname, "data", "digest_exoplanets.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l: string) => l.trim());
  const headers = parseCSVLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 5) continue;

    const row: Record<string, string | number | null> = {};
    headers.forEach((h: string, index: number) => {
      const value = values[index] || "";
      if (NUMERIC_FIELDS.has(h)) {
        const number = parseFloat(value);
        row[h] = isNaN(number) ? null : number;
      } else {
        row[h] = value || null;
      }
    });

    PLANET_DB.push(row as ExoplanetRecord);
  }

  logger.info(`🪐 Exoplanet database loaded: ${PLANET_DB.length} planets`);
  loaded = true;
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(searchText: string): string {
  return searchText.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
}

function formatPlanet(exoplanetRecord: ExoplanetRecord): FormattedPlanet {
  return {
    name: exoplanetRecord.pl_name,
    hostStar: exoplanetRecord.hostname,
    discoveryMethod: exoplanetRecord.discoverymethod,
    discoveryYear: exoplanetRecord.disc_year,
    discoveryFacility: exoplanetRecord.disc_facility,
    orbitalPeriodDays: exoplanetRecord.pl_orbper,
    radiusEarth: exoplanetRecord.pl_rade,
    massEarth: exoplanetRecord.pl_bmasse,
    semiMajorAxisAU: exoplanetRecord.pl_orbsmax,
    eccentricity: exoplanetRecord.pl_orbeccen,
    equilibriumTempK: exoplanetRecord.pl_eqt,
    stellarMassSolar: exoplanetRecord.st_mass,
    stellarRadiusSolar: exoplanetRecord.st_rad,
    stellarTempK: exoplanetRecord.st_teff,
    distanceParsecs: exoplanetRecord.sy_dist,
  };
}

// ─── Public API ────────────────────────────────────────────────

export interface SearchExoplanetsOptions {
  limit?: number;
  method?: string;
}

/**
 * Search exoplanets by name or host star.
 */
export function searchExoplanets(
  query: string,
  opts: SearchExoplanetsOptions = {},
) {
  ensureLoaded();

  const { limit = 10, method } = opts;
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery)
    return { count: 0, query, planets: [] as FormattedPlanet[] };

  let candidates = PLANET_DB;
  if (method) {
    const normalizedMethod = method.toLowerCase();
    candidates = candidates.filter(
      (exoplanetRecord: ExoplanetRecord) =>
        exoplanetRecord.discoverymethod &&
        exoplanetRecord.discoverymethod.toLowerCase().includes(normalizedMethod),
    );
  }

  const scored = candidates
    .map((exoplanetRecord: ExoplanetRecord) => {
      let score = 0;
      const name = normalizeSearch(exoplanetRecord.pl_name || "");
      const host = normalizeSearch(exoplanetRecord.hostname || "");

      if (name === normalizedQuery) score += 100;
      else if (host === normalizedQuery) score += 80;
      else if (name.startsWith(normalizedQuery)) score += 60;
      else if (host.startsWith(normalizedQuery)) score += 50;
      else if (name.includes(normalizedQuery)) score += 30;
      else if (host.includes(normalizedQuery)) score += 25;

      return { exoplanetRecord, score };
    })
    .filter((scoreItem) => scoreItem.score > 0)
    .sort((firstScore, secondScore) => secondScore.score - firstScore.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from NASA Exoplanet Archive (Public Domain).",
    planets: scored.map((scoreItem) => formatPlanet(scoreItem.exoplanetRecord)),
  };
}

/**
 * Get exoplanet by exact name.
 */
export function getExoplanetByName(name: string) {
  ensureLoaded();

  const normalizedQuery = normalizeSearch(name);
  const planet = PLANET_DB.find(
    (exoplanetRecord: ExoplanetRecord) =>
      normalizeSearch(exoplanetRecord.pl_name || "") === normalizedQuery,
  );

  if (!planet) return null;
  return formatPlanet(planet);
}

export interface RankExoplanetsOptions {
  limit?: number;
  order?: "asc" | "desc";
}

/**
 * Rank exoplanets by a specific field.
 */
export function rankExoplanets(
  field: string,
  opts: RankExoplanetsOptions = {},
) {
  ensureLoaded();

  const { limit = 10, order = "desc" } = opts;

  if (!(field in FIELD_META)) {
    return {
      error: `Unknown field: "${field}"`,
      availableFields: Object.entries(FIELD_META).map(([key, meta]) => ({
        key,
        label: meta.label,
        unit: meta.unit,
      })),
    };
  }

  const fieldKey = field as ExoplanetField;
  const meta = FIELD_META[fieldKey];

  const ranked = PLANET_DB.filter((exoplanetRecord: ExoplanetRecord) => exoplanetRecord[fieldKey] !== null)
    .sort((exoplanetRecord: ExoplanetRecord, b: ExoplanetRecord) => {
      const valueA = exoplanetRecord[fieldKey];
      const valueB = b[fieldKey];
      if (
        valueA === null ||
        valueA === undefined ||
        valueB === null ||
        valueB === undefined
      )
        return 0;
      return order === "asc" ? valueA - valueB : valueB - valueA;
    })
    .slice(0, limit);

  return {
    field,
    label: meta.label,
    unit: meta.unit,
    order,
    count: ranked.length,
    note: "Data from NASA Exoplanet Archive (Public Domain).",
    planets: ranked.map((exoplanetRecord: ExoplanetRecord) => ({
      name: exoplanetRecord.pl_name,
      hostStar: exoplanetRecord.hostname,
      value: exoplanetRecord[fieldKey],
      discoveryYear: exoplanetRecord.disc_year,
      method: exoplanetRecord.discoverymethod,
    })),
  };
}

/**
 * Get discovery method statistics.
 */
export function getDiscoveryStats() {
  ensureLoaded();

  const methods: Record<string, number> = {};
  const yearRange = { min: Infinity, max: -Infinity };
  const facilities: Record<string, number> = {};

  for (const exoplanetRecord of PLANET_DB) {
    const methodName = exoplanetRecord.discoverymethod || "Unknown";
    methods[methodName] = (methods[methodName] || 0) + 1;

    if (exoplanetRecord.disc_year) {
      yearRange.min = Math.min(yearRange.min, exoplanetRecord.disc_year);
      yearRange.max = Math.max(yearRange.max, exoplanetRecord.disc_year);
    }

    const facilityName = exoplanetRecord.disc_facility || "Unknown";
    facilities[facilityName] = (facilities[facilityName] || 0) + 1;
  }

  const sortedMethods = Object.entries(methods)
    .sort((firstMethod, secondMethod) => secondMethod[1] - firstMethod[1])
    .map(([method, count]) => ({ method, count }));

  const topFacilities = Object.entries(facilities)
    .sort((firstFacility, secondFacility) => secondFacility[1] - firstFacility[1])
    .slice(0, 15)
    .map(([facility, count]) => ({ facility, count }));

  return {
    totalPlanets: PLANET_DB.length,
    yearRange: {
      first: yearRange.min === Infinity ? null : yearRange.min,
      latest: yearRange.max === -Infinity ? null : yearRange.max,
    },
    discoveryMethods: sortedMethods,
    topFacilities,
    note: "Data from NASA Exoplanet Archive (Public Domain).",
  };
}

export interface GetHabitableZonePlanetsOptions {
  limit?: number;
}

/**
 * Find potentially habitable exoplanets (conservative habitable zone).
 */
export function getHabitableZonePlanets(
  opts: GetHabitableZonePlanetsOptions = {},
) {
  ensureLoaded();

  const { limit = 20 } = opts;

  // Conservative habitable zone: equilibrium temp roughly 200-320K
  // OR semi-major axis in ~0.8-1.5 AU for sun-like stars
  const habitable = PLANET_DB.filter((exoplanetRecord: ExoplanetRecord) => {
    if (exoplanetRecord.pl_eqt !== null && exoplanetRecord.pl_eqt >= 200 && exoplanetRecord.pl_eqt <= 320) return true;
    if (
      exoplanetRecord.pl_orbsmax !== null &&
      exoplanetRecord.st_teff !== null &&
      exoplanetRecord.pl_orbsmax >= 0.7 &&
      exoplanetRecord.pl_orbsmax <= 1.8 &&
      exoplanetRecord.st_teff >= 4000 &&
      exoplanetRecord.st_teff <= 7000
    )
      return true;
    return false;
  })
    .sort((firstPlanet: ExoplanetRecord, secondPlanet: ExoplanetRecord) => {
      // Prefer planets with measured radii close to Earth
      const radiusDeltaA = firstPlanet.pl_rade !== null ? Math.abs(firstPlanet.pl_rade - 1) : 100;
      const radiusDeltaB = secondPlanet.pl_rade !== null ? Math.abs(secondPlanet.pl_rade - 1) : 100;
      return radiusDeltaA - radiusDeltaB;
    })
    .slice(0, limit);

  return {
    count: habitable.length,
    criteria:
      "Equilibrium temperature 200-320K OR semi-major axis ~0.7-1.8 AU around sun-like star (4000-7000K)",
    note: "Data from NASA Exoplanet Archive (Public Domain). This is a simplified heuristic, not a definitive habitability assessment.",
    planets: habitable.map(formatPlanet),
  };
}

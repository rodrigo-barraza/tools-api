import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";

/**
 * World Bank Fetcher — Static In-Memory Country Indicators Database
 *
 * Loads ~217 countries with 15 key development indicators into memory.
 * Provides country lookup, indicator ranking, and comparison queries
 * without any external API calls.
 *
 * Source: World Bank Open Data (CC BY 4.0)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CSV Parser ────────────────────────────────────────────────

function parseCSVLine(line: any) {
  const fields: any[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Load & Index ──────────────────────────────────────────────

const COUNTRY_DB: any[] = [];
let loaded = false;

// Indicator metadata for human-readable output
const INDICATOR_META: Record<string, any> = {
  gdp_usd: { label: "GDP (current US$)", unit: "USD" },
  gdp_per_capita_usd: { label: "GDP per capita", unit: "USD" },
  population: { label: "Population", unit: "people" },
  life_expectancy: { label: "Life expectancy", unit: "years" },
  infant_mortality_per_1k: {
    label: "Infant mortality rate",
    unit: "per 1,000 births",
  },
  co2_per_capita_tons: {
    label: "CO2 emissions per capita",
    unit: "metric tons",
  },
  literacy_rate_pct: { label: "Literacy rate (adult)", unit: "%" },
  internet_users_pct: { label: "Internet users", unit: "%" },
  unemployment_pct: { label: "Unemployment rate", unit: "%" },
  inflation_cpi_pct: { label: "Inflation (CPI)", unit: "% annual" },
  forest_area_pct: { label: "Forest area", unit: "% of land" },
  renewable_energy_pct: { label: "Renewable energy", unit: "% of total" },
  gini_index: { label: "Gini index", unit: "index (0-100)" },
  electricity_access_pct: { label: "Access to electricity", unit: "%" },
  health_expenditure_per_capita_usd: {
    label: "Health expenditure per capita",
    unit: "USD",
  },
};

const INDICATOR_KEYS = Object.keys(INDICATOR_META);

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  const csvPath = join(__dirname, "data", "digest_world_indicators.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l: any) => l.trim());
  const headers = parseCSVLine(lines[0]);

  const SKIP_NUMERIC = new Set(["country_code", "country_name"]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;

    const row: Record<string, any> = {};
    headers.forEach((h: any, index: any) => {
      const value = values[index] || "";
      if (SKIP_NUMERIC.has(h)) {
        row[h] = value;
      } else {
        const num = parseFloat(value);
        row[h] = isNaN(num) ? null : num;
      }
    });

    COUNTRY_DB.push(row);
  }

  logger.info(
    `🌍 World Bank indicators loaded: ${COUNTRY_DB.length} countries, ${INDICATOR_KEYS.length} indicators`,
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(str: any) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatCountry(country: any) {
  const result = {
    countryCode: country.country_code,
    countryName: country.country_name,
    dataYear: country.data_year,
    indicators: {} as Record<string, any>,
  };

  for (const key of INDICATOR_KEYS) {
    if (country[key] !== null && country[key] !== undefined) {
      const meta = INDICATOR_META[key];
      result.indicators[key] = {
        label: meta.label,
        value: country[key],
        unit: meta.unit,
      };
    }
  }

  return result;
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Get all indicators for a specific country.

 * @returns {object|null} Country indicators or null
 */
export function getCountryIndicators(code: any) {
  ensureLoaded();

  const c = code.toUpperCase().trim();
  const country =
    COUNTRY_DB.find((r: any) => r.country_code === c) ||
    COUNTRY_DB.find(
      (r: any) =>
        r.country_name && normalizeSearch(r.country_name).includes(normalizeSearch(code)),
    );

  if (!country) return null;
  return formatCountry(country);
}

/**
 * Rank countries by a specific indicator (highest first by default).


 * @returns {object} Ranked results
 */
export function rankCountriesByIndicator(indicator: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, order = "desc" } = opts;

  if (!INDICATOR_META[indicator]) {
    return {
      error: `Unknown indicator: "${indicator}"`,
      availableIndicators: Object.entries(INDICATOR_META).map(
        ([key, meta]: any) => ({
          key,
          label: meta.label,
          unit: meta.unit,
        }),
      ),
    };
  }

  const meta = INDICATOR_META[indicator];

  const ranked = COUNTRY_DB.filter((c: any) => c[indicator] !== null)
    .sort((a: any, b: any) =>
      order === "asc"
        ? a[indicator] - b[indicator]
        : b[indicator] - a[indicator],
    )
    .slice(0, limit);

  return {
    indicator,
    indicatorLabel: meta.label,
    unit: meta.unit,
    order,
    count: ranked.length,
    note: "Data from World Bank Open Data (CC BY 4.0). Values are most recent available year (2018-2024).",
    countries: ranked.map((c: any) => ({
      countryCode: c.country_code,
      countryName: c.country_name,
      value: c[indicator],
      dataYear: c.data_year,
    })),
  };
}

/**
 * Compare indicators between multiple countries.


 * @returns {object} Comparison results
 */
export function compareCountries(countryCodes: any, indicator: any = null) {
  ensureLoaded();

  if (indicator && !INDICATOR_META[indicator]) {
    return {
      error: `Unknown indicator: "${indicator}"`,
      availableIndicators: Object.entries(INDICATOR_META).map(
        ([key, meta]: any) => ({
          key,
          label: meta.label,
          unit: meta.unit,
        }),
      ),
    };
  }

  const results = countryCodes.map((code: any) => {
    const c = code.toUpperCase().trim();
    const country =
      COUNTRY_DB.find((r: any) => r.country_code === c) ||
      COUNTRY_DB.find(
        (r: any) =>
          r.country_name &&
          normalizeSearch(r.country_name).includes(normalizeSearch(code)),
      );

    if (!country) return { query: code, found: false };

    if (indicator) {
      const meta = INDICATOR_META[indicator];
      return {
        query: code,
        found: true,
        countryCode: country.country_code,
        countryName: country.country_name,
        indicator,
        label: meta.label,
        value: country[indicator],
        unit: meta.unit,
        dataYear: country.data_year,
      };
    }

    return { query: code, found: true, ...formatCountry(country) };
  });

  return {
    count: results.filter((r: any) => r.found).length,
    note: "Data from World Bank Open Data (CC BY 4.0).",
    comparison: results,
  };
}

/**
 * List all available indicators with metadata.
 * @returns {object} Available indicators
 */
export function getAvailableIndicators() {
  ensureLoaded();

  return {
    totalCountries: COUNTRY_DB.length,
    indicators: Object.entries(INDICATOR_META).map(([key, meta]: any) => {
      const nonNull = COUNTRY_DB.filter((c: any) => c[key] !== null).length;
      return {
        key,
        label: meta.label,
        unit: meta.unit,
        coverage: nonNull,
        coveragePct: Math.round((nonNull / COUNTRY_DB.length) * 100),
      };
    }),
  };
}

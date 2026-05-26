import { REST_COUNTRIES_BASE_URL } from "../../constants.ts";
import { RawRestCountry, RestCountry } from "../../types/knowledge.ts";

/**
 * Rest Countries API fetcher.
 * https://restcountries.com/ — no auth, fully open.
 * Returns country info: population, languages, currencies, flags, etc.
 */

// ─── Helpers ───────────────────────────────────────────────────────

function normalizeCountry(c: RawRestCountry): RestCountry {
  return {
    name: c.name?.common || null,
    officialName: c.name?.official || null,
    nativeNames: c.name?.nativeName
      ? Object.values(c.name.nativeName)
          .map((item) => item.common || "")
          .filter(Boolean)
          .slice(0, 3)
      : [],
    cca2: c.cca2 || null,
    cca3: c.cca3 || null,
    capital: c.capital || [],
    region: c.region || null,
    subregion: c.subregion || null,
    population: c.population || 0,
    area: c.area || null,
    languages: c.languages ? Object.values(c.languages) : [],
    currencies: c.currencies
      ? Object.entries(c.currencies).map(([code, info]) => ({
          code,
          name: info.name || "",
          symbol: info.symbol || undefined,
        }))
      : [],
    timezones: c.timezones || [],
    borders: c.borders || [],
    flag: c.flag || null,
    flagPng: c.flags?.png || null,
    flagSvg: c.flags?.svg || null,
    coatOfArms: c.coatOfArms?.png || null,
    googleMaps: c.maps?.googleMaps || null,
    callingCodes: c.idd?.root
      ? (c.idd.suffixes || [""]).map((s) => `${c.idd!.root}${s}`).slice(0, 3)
      : [],
    continent: c.continents?.[0] || null,
    independent: c.independent ?? null,
    unMember: c.unMember ?? null,
    landlocked: c.landlocked ?? null,
    carSide: c.car?.side || null,
    startOfWeek: c.startOfWeek || null,
  };
}

// ─── Get Country by Name ───────────────────────────────────────────

/**
 * Search for a country by name (partial match).
 */
export async function searchCountries(name: string) {
  const url = `${REST_COUNTRIES_BASE_URL}/name/${encodeURIComponent(name)}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, countries: [] as RestCountry[] };
  }
  if (!response.ok) {
    throw new Error(`Rest Countries API → ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as RawRestCountry[];
  return {
    found: true,
    count: data.length,
    countries: data.slice(0, 10).map(normalizeCountry),
  };
}

// ─── Get Country by Code ───────────────────────────────────────────

/**
 * Get a single country by ISO 3166-1 alpha-2 or alpha-3 code.
 */
export async function getCountryByCode(code: string) {
  const url = `${REST_COUNTRIES_BASE_URL}/alpha/${encodeURIComponent(code.toUpperCase())}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, code, name: null, officialName: null, nativeNames: [] as string[], cca2: null, cca3: null, capital: [] as string[], region: null, subregion: null, population: 0, area: null, languages: [] as string[], currencies: [] as Array<{ code: string, name: string, symbol?: string }>, timezones: [] as string[], borders: [] as string[], flag: null, flagPng: null, flagSvg: null, coatOfArms: null, googleMaps: null, callingCodes: [] as string[], continent: null, independent: null, unMember: null, landlocked: null, carSide: null, startOfWeek: null };
  }
  if (!response.ok) {
    throw new Error(`Rest Countries API → ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as RawRestCountry | RawRestCountry[];
  const country = Array.isArray(data) ? data[0] : data;
  return { found: true, ...normalizeCountry(country) };
}

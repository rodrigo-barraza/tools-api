import { REST_COUNTRIES_BASE_URL } from "../../constants.ts";
import { RawRestCountry, RestCountry } from "../../types/knowledge.ts";

/**
 * Rest Countries API fetcher.
 * https://restcountries.com/ — no auth, fully open.
 * Returns country info: population, languages, currencies, flags, etc.
 */

// ─── Helpers ───────────────────────────────────────────────────────

function normalizeCountry(rawRestCountry: RawRestCountry): RestCountry {
  return {
    name: rawRestCountry.name?.common || null,
    officialName: rawRestCountry.name?.official || null,
    nativeNames: rawRestCountry.name?.nativeName
      ? Object.values(rawRestCountry.name.nativeName)
          .map((item) => item.common || "")
          .filter(Boolean)
          .slice(0, 3)
      : [],
    cca2: rawRestCountry.cca2 || null,
    cca3: rawRestCountry.cca3 || null,
    capital: rawRestCountry.capital || [],
    region: rawRestCountry.region || null,
    subregion: rawRestCountry.subregion || null,
    population: rawRestCountry.population || 0,
    area: rawRestCountry.area || null,
    languages: rawRestCountry.languages ? Object.values(rawRestCountry.languages) : [],
    currencies: rawRestCountry.currencies
      ? Object.entries(rawRestCountry.currencies).map(([code, info]) => ({
          code,
          name: info.name || "",
          symbol: info.symbol || undefined,
        }))
      : [],
    timezones: rawRestCountry.timezones || [],
    borders: rawRestCountry.borders || [],
    flag: rawRestCountry.flag || null,
    flagPng: rawRestCountry.flags?.png || null,
    flagSvg: rawRestCountry.flags?.svg || null,
    coatOfArms: rawRestCountry.coatOfArms?.png || null,
    googleMaps: rawRestCountry.maps?.googleMaps || null,
    callingCodes: rawRestCountry.idd?.root
      ? (rawRestCountry.idd.suffixes || [""]).map((s) => `${rawRestCountry.idd!.root}${s}`).slice(0, 3)
      : [],
    continent: rawRestCountry.continents?.[0] || null,
    independent: rawRestCountry.independent ?? null,
    unMember: rawRestCountry.unMember ?? null,
    landlocked: rawRestCountry.landlocked ?? null,
    carSide: rawRestCountry.car?.side || null,
    startOfWeek: rawRestCountry.startOfWeek || null,
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
    throw new Error(
      `Rest Countries API → ${response.status} ${response.statusText}`,
    );
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
    return {
      found: false,
      code,
      name: null,
      officialName: null,
      nativeNames: [] as string[],
      cca2: null,
      cca3: null,
      capital: [] as string[],
      region: null,
      subregion: null,
      population: 0,
      area: null,
      languages: [] as string[],
      currencies: [] as Array<{ code: string; name: string; symbol?: string }>,
      timezones: [] as string[],
      borders: [] as string[],
      flag: null,
      flagPng: null,
      flagSvg: null,
      coatOfArms: null,
      googleMaps: null,
      callingCodes: [] as string[],
      continent: null,
      independent: null,
      unMember: null,
      landlocked: null,
      carSide: null,
      startOfWeek: null,
    };
  }
  if (!response.ok) {
    throw new Error(
      `Rest Countries API → ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as RawRestCountry | RawRestCountry[];
  const country = Array.isArray(data) ? data[0] : data;
  return { found: true, ...normalizeCountry(country) };
}

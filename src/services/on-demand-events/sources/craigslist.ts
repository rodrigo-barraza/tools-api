import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";
import { fetchCraigslistEvents } from "../../../fetchers/event/CraigslistFetcher.ts";

// ─── Craigslist City Subdomain Map ──────────────────────────────

const CRAIGSLIST_CITY_MAP: Record<string, string> = {
  // Canada
  "vancouver": "vancouver",
  "victoria": "victoria",
  "calgary": "calgary",
  "edmonton": "edmonton",
  "winnipeg": "winnipeg",
  "toronto": "toronto",
  "ottawa": "ottawa",
  "montreal": "montreal",
  "quebec city": "quebec",
  "halifax": "halifax",
  "saskatoon": "saskatoon",
  "regina": "regina",
  "st. john's": "newfoundland",
  "kelowna": "kelowna",
  "comox valley": "comoxvalley",
  "barrie": "barrie",
  "hamilton": "hamilton",
  "kingston": "kingston",
  "kitchener": "kitchener",
  "london": "london",
  "thunder bay": "thunderbay",
  "windsor": "windsor",

  // United States — Major cities
  "new york": "newyork",
  "new york city": "newyork",
  "nyc": "newyork",
  "los angeles": "losangeles",
  "chicago": "chicago",
  "houston": "houston",
  "phoenix": "phoenix",
  "philadelphia": "philadelphia",
  "san antonio": "sanantonio",
  "san diego": "sandiego",
  "dallas": "dallas",
  "san jose": "sfbay",
  "san francisco": "sfbay",
  "austin": "austin",
  "seattle": "seattle",
  "denver": "denver",
  "washington": "washingtondc",
  "washington dc": "washingtondc",
  "nashville": "nashville",
  "portland": "portland",
  "las vegas": "lasvegas",
  "memphis": "memphis",
  "baltimore": "baltimore",
  "milwaukee": "milwaukee",
  "albuquerque": "albuquerque",
  "tucson": "tucson",
  "fresno": "fresno",
  "sacramento": "sacramento",
  "mesa": "phoenix",
  "atlanta": "atlanta",
  "omaha": "omaha",
  "miami": "miami",
  "minneapolis": "minneapolis",
  "cleveland": "cleveland",
  "raleigh": "raleigh",
  "tampa": "tampa",
  "st. louis": "stlouis",
  "pittsburgh": "pittsburgh",
  "cincinnati": "cincinnati",
  "orlando": "orlando",
  "detroit": "detroit",
  "boston": "boston",
  "charlotte": "charlotte",
  "columbus": "columbus",
  "indianapolis": "indianapolis",
  "jacksonville": "jacksonville",
  "kansas city": "kansascity",
  "new orleans": "neworleans",
  "salt lake city": "saltlakecity",
  "honolulu": "honolulu",
  "anchorage": "anchorage",
  "boise": "boise",
  "richmond": "richmond",
  "des moines": "desmoines",
  "little rock": "littlerock",
  "buffalo": "buffalo",
  "rochester": "rochester",
  "spokane": "spokane",
  "madison": "madison",
};

export function resolveCraigslistSubdomain(cityName: string): string | null {
  const normalizedCity = cityName.toLowerCase().trim();
  return CRAIGSLIST_CITY_MAP[normalizedCity] ?? null;
}

export async function fetchCraigslistOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  const subdomain = resolveCraigslistSubdomain(options.city);
  if (!subdomain) return [];
  return fetchCraigslistEvents(subdomain);
}

import { geocodeLocation } from "../fetchers/shared/GeocodingUtility.ts";
import type { GeocodeResult } from "../fetchers/shared/GeocodingUtility.ts";
import { fetchTicketmasterEvents } from "../fetchers/event/TicketmasterFetcher.ts";
import { fetchSeatGeekEvents } from "../fetchers/event/SeatGeekFetcher.ts";
import { fetchCraigslistEvents } from "../fetchers/event/CraigslistFetcher.ts";
import { fetchMovieEvents } from "../fetchers/event/MovieFetcher.ts";
import type { CachedEvent } from "../caches/EventCache.ts";
import CONFIG from "../config.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface OnDemandEventOptions {
  city: string;
  query?: string;
  category?: string;
  days?: number;
  limit?: number;
}

export interface OnDemandEventResult {
  location: {
    city: string;
    admin1: string | null;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  };
  count: number;
  sources: string[];
  events: CachedEvent[];
}

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

/**
 * Resolve a city name to a Craigslist subdomain. Case-insensitive lookup.
 * Returns null if the city is not in the map (Craigslist will be skipped).
 */
function resolveCraigslistSubdomain(cityName: string): string | null {
  const normalizedCity = cityName.toLowerCase().trim();
  return CRAIGSLIST_CITY_MAP[normalizedCity] ?? null;
}

// ─── ISO Country Code → TMDb Region Map ────────────────────────

function countryCodeToTmdbRegion(countryCode: string): string {
  return countryCode.toUpperCase();
}

// ─── Deduplication ──────────────────────────────────────────────

function normalizeEventName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function deduplicateEvents(events: CachedEvent[]): CachedEvent[] {
  const seen = new Map<string, CachedEvent>();

  for (const event of events) {
    const normalizedName = normalizeEventName(event.name);
    const dateKey = event.startDate
      ? new Date(event.startDate).toISOString().slice(0, 10)
      : "nodate";
    const deduplicationKey = `${normalizedName}::${dateKey}`;

    const existing = seen.get(deduplicationKey);
    if (!existing) {
      seen.set(deduplicationKey, event);
    } else {
      const existingFieldCount = Object.values(existing).filter(
        (value) => value != null && value !== "",
      ).length;
      const newFieldCount = Object.values(event).filter(
        (value) => value != null && value !== "",
      ).length;
      if (newFieldCount > existingFieldCount) {
        seen.set(deduplicationKey, event);
      }
    }
  }

  return Array.from(seen.values());
}

// ─── On-Demand Fetch Orchestrator ───────────────────────────────

export async function fetchOnDemandEvents(
  options: OnDemandEventOptions,
): Promise<OnDemandEventResult> {
  const { city, days = 30, limit = 100 } = options;

  // Step 1: Geocode the city name
  const geocodeResult = await geocodeLocation(city);
  if (!geocodeResult) {
    return {
      location: {
        city,
        admin1: null,
        country: "Unknown",
        countryCode: "XX",
        latitude: 0,
        longitude: 0,
      },
      count: 0,
      sources: [],
      events: [],
    };
  }

  const locationParams = {
    latitude: geocodeResult.latitude,
    longitude: geocodeResult.longitude,
    radiusMiles: 50,
    lookAheadDays: days,
  };

  // Step 2: Fan out to all available global APIs concurrently
  const fetchPromises: Array<{
    source: string;
    promise: Promise<CachedEvent[]>;
  }> = [];

  // Ticketmaster — global, lat/lng search
  if (CONFIG.TICKETMASTER_API_KEY) {
    fetchPromises.push({
      source: "ticketmaster",
      promise: fetchTicketmasterEvents(locationParams) as Promise<CachedEvent[]>,
    });
  }

  // SeatGeek — mostly US/Canada, lat/lng search
  if (CONFIG.SEATGEEK_CLIENT_ID) {
    fetchPromises.push({
      source: "seatgeek",
      promise: fetchSeatGeekEvents(locationParams) as Promise<CachedEvent[]>,
    });
  }

  // Craigslist — subdomain-based, only if city is in map
  const craigslistSubdomain = resolveCraigslistSubdomain(
    geocodeResult.name || city,
  );
  if (craigslistSubdomain) {
    fetchPromises.push({
      source: "craigslist",
      promise: fetchCraigslistEvents(craigslistSubdomain) as Promise<CachedEvent[]>,
    });
  }

  // TMDb Movies — global, region-based
  if (CONFIG.TMDB_API_KEY) {
    const tmdbRegion = countryCodeToTmdbRegion(geocodeResult.countryCode);
    fetchPromises.push({
      source: "tmdb",
      promise: fetchMovieEvents(tmdbRegion) as Promise<CachedEvent[]>,
    });
  }

  // Step 3: Settle all promises (graceful partial failures)
  const settledResults = await Promise.allSettled(
    fetchPromises.map((entry) => entry.promise),
  );

  const allEvents: CachedEvent[] = [];
  const successfulSources: string[] = [];

  for (let index = 0; index < settledResults.length; index++) {
    const result = settledResults[index];
    const sourceName = fetchPromises[index].source;

    if (result.status === "fulfilled") {
      allEvents.push(...result.value);
      successfulSources.push(sourceName);
      logger.info(
        `[OnDemandEvents/${sourceName}] ✅ ${result.value.length} events for "${city}"`,
      );
    } else {
      logger.warn(
        `[OnDemandEvents/${sourceName}] ⚠️ Failed for "${city}": ${errorMessage(result.reason)}`,
      );
    }
  }

  // Step 4: Deduplicate and sort
  let events = deduplicateEvents(allEvents);
  events.sort((eventA, eventB) => {
    const dateA = eventA.startDate ? new Date(eventA.startDate).getTime() : Infinity;
    const dateB = eventB.startDate ? new Date(eventB.startDate).getTime() : Infinity;
    return dateA - dateB;
  });

  // Apply limit
  if (events.length > limit) {
    events = events.slice(0, limit);
  }

  return {
    location: {
      city: geocodeResult.name,
      admin1: geocodeResult.admin1,
      country: geocodeResult.country,
      countryCode: geocodeResult.countryCode,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
    },
    count: events.length,
    sources: successfulSources,
    events,
  };
}

// Re-export for testing
export { resolveCraigslistSubdomain, deduplicateEvents, geocodeLocation };
export type { GeocodeResult };

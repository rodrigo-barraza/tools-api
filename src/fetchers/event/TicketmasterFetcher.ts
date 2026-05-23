import { days } from "@rodrigo-barraza/utilities-library";
import CONFIG from "../../config.ts";
import {
  EVENT_SOURCES,
  TICKETMASTER_CATEGORY_MAP,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from "../../constants.ts";
import rateLimiter from "../../services/RateLimiterService.ts";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

/**
 * Map Ticketmaster segment name to our normalized category.
 */
function normalizeCategory(segment: any) {
  if (!segment) return EVENT_CATEGORIES.OTHER;
  return TICKETMASTER_CATEGORY_MAP[segment] || EVENT_CATEGORIES.OTHER;
}

/**
 * Maps Ticketmaster event status codes to our internal normalized status.
 */
function mapTicketmasterStatus(statusCode: string | undefined): string {
  const map: Record<string, string> = {
    onsale: EVENT_STATUSES.ON_SALE,
    offsale: EVENT_STATUSES.OFF_SALE,
    cancelled: EVENT_STATUSES.CANCELLED,
    canceled: EVENT_STATUSES.CANCELLED, // Ticketmaster sometimes uses US spelling
    postponed: EVENT_STATUSES.POSTPONED,
    rescheduled: EVENT_STATUSES.RESCHEDULED,
  };
  const code = statusCode?.toLowerCase();
  return code && map[code] ? map[code] : EVENT_STATUSES.ON_SALE;
}

/**
 * Extract price range from Ticketmaster event.
 */
function extractPriceRange(event: any) {
  const prices = event.priceRanges;
  if (!prices || prices.length === 0) return null;
  const first = prices[0];
  return {
    min: first.min ?? null,
    max: first.max ?? null,
    currency: first.currency || "USD",
  };
}

/**
 * Extract venue info from Ticketmaster event.
 */
function extractVenue(event: any) {
  const venues = event._embedded?.venues;
  if (!venues || venues.length === 0) {
    return {
      name: null,
      address: null,
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
    };
  }

  const v = venues[0];
  return {
    name: v.name || null,
    address: v.address?.line1 || null,
    city: v.city?.name || null,
    state: v.state?.stateCode || null,
    country: v.country?.countryCode || null,
    latitude: v.location?.latitude ? parseFloat(v.location.latitude) : null,
    longitude: v.location?.longitude ? parseFloat(v.location.longitude) : null,
  };
}

/**
 * Extract genre strings from Ticketmaster classifications.
 */
function extractGenres(event: any) {
  const classifications = event.classifications;
  if (!classifications) return [];

  const genres = new Set();
  for (const c of classifications) {
    if (c.genre?.name && c.genre.name !== "Undefined") {
      genres.add(c.genre.name);
    }
    if (c.subGenre?.name && c.subGenre.name !== "Undefined") {
      genres.add(c.subGenre.name);
    }
  }
  return [...genres];
}

/**
 * Normalize a single Ticketmaster event to our unified schema.
 */
function normalizeEvent(event: any) {
  const segment = event.classifications?.[0]?.segment?.name || null;
  const images = event.images || [];
  const bestImage =
    images.find((i: any) => i.ratio === "16_9" && i.width >= 640) ||
    images[0] ||
    null;

  return {
    sourceId: event.id,
    source: EVENT_SOURCES.TICKETMASTER,
    name: event.name,
    description: event.info || event.pleaseNote || null,
    url: event.url || null,
    imageUrl: bestImage?.url || null,
    startDate: event.dates?.start?.dateTime
      ? new Date(event.dates.start.dateTime)
      : event.dates?.start?.localDate
        ? new Date(event.dates.start.localDate)
        : null,
    endDate: event.dates?.end?.dateTime
      ? new Date(event.dates.end.dateTime)
      : null,
    venue: extractVenue(event),
    category: normalizeCategory(segment),
    genres: extractGenres(event),
    priceRange: extractPriceRange(event),
    status: mapTicketmasterStatus(event.dates?.status?.code),
    fetchedAt: new Date(),
  };
}

/**
 * Fetch events from Ticketmaster Discovery API v2.
 * Searches within the configured radius of the configured lat/lng.
 * Paginates up to 1000 results (API limit: size * page < 1000).
 */
export async function fetchTicketmasterEvents() {
  if (!CONFIG.TICKETMASTER_API_KEY) {
    throw new Error("TICKETMASTER_API_KEY is not configured");
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + days(30));

  const params = new URLSearchParams({
    apikey: CONFIG.TICKETMASTER_API_KEY,
    latlong: `${CONFIG.LATITUDE},${CONFIG.LONGITUDE}`,
    radius: String(CONFIG.RADIUS_MILES),
    unit: "miles",
    size: "200",
    sort: "date,asc",
    startDateTime: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    endDateTime: endDate.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });

  const allEvents: unknown[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && allEvents.length < 1000) {
    params.set("page", String(page));

    const response = await fetch(`${BASE_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`Ticketmaster API returned ${response.status}`);
    }

    const data = await response.json();
    const events = data._embedded?.events || [];
    allEvents.push(...events.map(normalizeEvent));

    totalPages = data.page?.totalPages || 1;
    page++;

    // Respect rate limit via centralized rate limiter
    if (page < totalPages) {
      await rateLimiter.wait("TICKETMASTER");
    }
  }

  return allEvents;
}

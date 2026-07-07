import CONFIG from "../../config.ts";
import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.ts";
import type { CachedEvent } from "../../caches/EventCache.ts";

const BASE_URL = "https://places.googleapis.com/v1/places:searchNearby";

// Place types that indicate event-related venues
const INCLUDED_TYPES = [
  "event_venue",
  "night_club",
  "performing_arts_theater",
  "movie_theater",
  "stadium",
  "amusement_park",
  "art_gallery",
  "museum",
  "convention_center",
];

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  editorialSummary?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
}

interface GooglePlacesFetchOptions {
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
  city?: string;
}

/**
 * Fetch event venues from Google Places API (New).
 * Returns nearby event-related venues as potential event sources.
 * Accepts optional location overrides; falls back to CONFIG defaults.
 */
export async function fetchGooglePlacesEvents(
  options: GooglePlacesFetchOptions = {},
): Promise<CachedEvent[]> {
  if (!CONFIG.GOOGLE_CLOUD_API_KEY) {
    throw new Error("GOOGLE_CLOUD_API_KEY is not configured");
  }

  const searchLatitude = options.latitude ?? CONFIG.LATITUDE;
  const searchLongitude = options.longitude ?? CONFIG.LONGITUDE;
  const searchRadiusMiles = options.radiusMiles ?? CONFIG.RADIUS_MILES;
  const venueCity = options.city ?? undefined;

  const body = {
    includedTypes: INCLUDED_TYPES,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude: searchLatitude,
          longitude: searchLongitude,
        },
        radius: Math.min(searchRadiusMiles * 1609.34, 50000),
      },
    },
  };

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": CONFIG.GOOGLE_CLOUD_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress," +
        "places.location,places.types,places.websiteUri," +
        "places.regularOpeningHours,places.photos," +
        "places.editorialSummary,places.primaryType",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Places API returned ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as { places?: GooglePlace[] };
  const places = data.places || [];

  return places.map((place: GooglePlace) => {
    const category = mapPlaceTypeToCategory(
      place.primaryType || place.types?.[0],
    );

    return {
      sourceId: `gplaces-${place.id}`,
      source: EVENT_SOURCES.GOOGLE_PLACES,
      name: place.displayName?.text || "Unknown Venue",
      description: place.editorialSummary?.text || undefined,
      url: place.websiteUri || undefined,
      imageUrl: undefined,
      startDate: undefined,
      endDate: undefined,
      venue: {
        name: place.displayName?.text || undefined,
        address: place.formattedAddress || undefined,
        city: venueCity,
        state: undefined,
        country: undefined,
        latitude: place.location?.latitude ?? undefined,
        longitude: place.location?.longitude ?? undefined,
      },
      category,
      genres: (place.types || []).slice(0, 5),
      priceRange: undefined,
      status: "onsale",
      fetchedAt: new Date(),
    };
  });
}

/**
 * Map a Google Places type to our normalized category.
 */
function mapPlaceTypeToCategory(type: string | undefined) {
  const map: Record<string, string> = {
    event_venue: EVENT_CATEGORIES.OTHER,
    night_club: EVENT_CATEGORIES.MUSIC,
    performing_arts_theater: EVENT_CATEGORIES.ARTS,
    movie_theater: EVENT_CATEGORIES.FILM,
    stadium: EVENT_CATEGORIES.SPORTS,
    amusement_park: EVENT_CATEGORIES.FAMILY,
    art_gallery: EVENT_CATEGORIES.ARTS,
    museum: EVENT_CATEGORIES.ARTS,
    convention_center: EVENT_CATEGORIES.TECH,
  };
  return type && map[type] ? map[type] : EVENT_CATEGORIES.OTHER;
}

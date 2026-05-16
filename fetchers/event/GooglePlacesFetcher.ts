import CONFIG from "../../config.js";
import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.js";

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

/**
 * Fetch event venues from Google Places API (New).
 * Returns nearby event-related venues as potential event sources.
 * Note: Google Places doesn't directly list events — it lists venues
 * that are likely hosting events. We mark these as "venues" category.
 */
export async function fetchGooglePlacesEvents() {
  if (!CONFIG.GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  }

  const body = {
    includedTypes: INCLUDED_TYPES,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude: CONFIG.LATITUDE,
          longitude: CONFIG.LONGITUDE,
        },
        radius: Math.min(CONFIG.RADIUS_MILES * 1609.34, 50000), // Convert miles to meters, API max is 50km
      },
    },
  };

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": CONFIG.GOOGLE_PLACES_API_KEY,
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

  const data = await response.json();
  const places = data.places || [];

  return places.map((place) => {
    const category = mapPlaceTypeToCategory(
      place.primaryType || place.types?.[0],
    );

    return {
      sourceId: `gplaces-${place.id}`,
      source: EVENT_SOURCES.GOOGLE_PLACES,
      name: place.displayName?.text || "Unknown Venue",
      description: place.editorialSummary?.text || null,
      url: place.websiteUri || null,
      imageUrl: null,
      startDate: null,
      endDate: null,
      venue: {
        name: place.displayName?.text || null,
        address: place.formattedAddress || null,
        city: "Vancouver",
        state: "BC",
        country: "CA",
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
      },
      category,
      genres: (place.types || []).slice(0, 5),
      priceRange: null,
      status: "onsale",
      fetchedAt: new Date(),
    };
  });
}

/**
 * Map a Google Places type to our normalized category.
 */
function mapPlaceTypeToCategory(type) {
  const map = {
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
  return map[type] || EVENT_CATEGORIES.OTHER;
}

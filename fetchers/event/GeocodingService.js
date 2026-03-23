import CONFIG from "../../config.js";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

// In-memory cache to avoid re-geocoding the same addresses
const geocodeCache = new Map();

/**
 * Geocode an address string into lat/lng coordinates.
 * Results are cached in-memory to reduce API calls.
 * @param {string} address - Full or partial address string
 * @returns {{ latitude: number, longitude: number, formattedAddress: string } | null}
 */
export async function geocodeAddress(address) {
  if (!address || !CONFIG.GOOGLE_PLACES_API_KEY) return null;

  // Normalize cache key
  const cacheKey = address.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    address,
    key: CONFIG.GOOGLE_PLACES_API_KEY,
    region: "ca",
  });

  try {
    const response = await fetch(`${GEOCODE_URL}?${params}`);

    if (!response.ok) {
      console.warn(`[Geocoding] ⚠️ API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.results?.length) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const result = data.results[0];
    const geo = result.geometry?.location;

    const geocoded = {
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      formattedAddress: result.formatted_address || null,
    };

    geocodeCache.set(cacheKey, geocoded);
    return geocoded;
  } catch (error) {
    console.warn(`[Geocoding] ⚠️ ${error.message}`);
    return null;
  }
}

/**
 * Enrich an event with geocoded coordinates if missing.
 * Only geocodes if the event has a venue name/city but no lat/lng.
 */
export async function enrichEventWithGeocode(event) {
  if (!event?.venue) return event;

  // Skip if already geocoded
  if (event.venue.latitude && event.venue.longitude) return event;

  // Build address from available venue info
  const parts = [
    event.venue.name,
    event.venue.address,
    event.venue.city,
    event.venue.state,
    event.venue.country,
  ].filter(Boolean);

  if (parts.length === 0) return event;

  const geocoded = await geocodeAddress(parts.join(", "));

  if (geocoded) {
    event.venue.latitude = geocoded.latitude;
    event.venue.longitude = geocoded.longitude;
    if (!event.venue.address && geocoded.formattedAddress) {
      event.venue.address = geocoded.formattedAddress;
    }
  }

  return event;
}

/**
 * Batch geocode multiple events (rate-limited).
 * Only geocodes events that are missing coordinates.
 * @param {Array} events - Array of event objects
 * @param {number} maxPerBatch - Max concurrent geocoding calls (default 5)
 */
export async function batchGeocodeEvents(events, maxPerBatch = 5) {
  const needsGeocode = events.filter(
    (e) => e.venue && !e.venue.latitude && !e.venue.longitude,
  );

  let geocoded = 0;

  // Process in chunks to avoid rate limiting
  for (let i = 0; i < needsGeocode.length; i += maxPerBatch) {
    const batch = needsGeocode.slice(i, i + maxPerBatch);
    await Promise.all(batch.map(enrichEventWithGeocode));
    geocoded += batch.length;
  }

  return geocoded;
}

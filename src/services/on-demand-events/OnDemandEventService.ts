import { toAlphanumeric } from "@rodrigo-barraza/utilities-library";
import { geocodeLocation } from "../../fetchers/shared/GeocodingUtility.ts";
import type { GeocodeResult } from "../../fetchers/shared/GeocodingUtility.ts";
import type { CachedEvent } from "../../caches/EventCache.ts";
import { getAvailableSources } from "./OnDemandEventRegistry.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

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

// ─── Deduplication ──────────────────────────────────────────────

function normalizeEventName(name: string): string {
  return toAlphanumeric(name);
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

  const sourceOptions = {
    city: geocodeResult.name || city,
    countryCode: geocodeResult.countryCode,
    latitude: geocodeResult.latitude,
    longitude: geocodeResult.longitude,
    days,
  };

  // Step 2: Get all available sources from the registry
  const availableSources = getAvailableSources();

  logger.info(
    `[OnDemandEvents] Querying ${availableSources.length} sources for "${city}" (${geocodeResult.countryCode})`,
  );

  // Step 3: Fan out to all sources concurrently
  const fetchEntries = availableSources.map((source) => ({
    name: source.name,
    promise: source.fetch(sourceOptions),
  }));

  const settledResults = await Promise.allSettled(
    fetchEntries.map((entry) => entry.promise),
  );

  const allEvents: CachedEvent[] = [];
  const successfulSources: string[] = [];

  for (let index = 0; index < settledResults.length; index++) {
    const result = settledResults[index];
    const sourceName = fetchEntries[index].name;

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

// Re-export for testing and external consumers
export { deduplicateEvents, geocodeLocation };
export type { GeocodeResult };

import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";
import { fetchSeatGeekEvents } from "../../../fetchers/event/SeatGeekFetcher.ts";

export async function fetchSeatGeekOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  return fetchSeatGeekEvents({
    latitude: options.latitude,
    longitude: options.longitude,
    radiusMiles: 50,
    lookAheadDays: options.days,
  }) as Promise<CachedEvent[]>;
}

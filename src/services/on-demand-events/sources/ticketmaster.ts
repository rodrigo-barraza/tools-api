import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";
import { fetchTicketmasterEvents } from "../../../fetchers/event/TicketmasterFetcher.ts";

export async function fetchTicketmasterOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  return fetchTicketmasterEvents({
    latitude: options.latitude,
    longitude: options.longitude,
    radiusMiles: 50,
    lookAheadDays: options.days,
  }) as Promise<CachedEvent[]>;
}

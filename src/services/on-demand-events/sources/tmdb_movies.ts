import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";
import { fetchMovieEvents } from "../../../fetchers/event/MovieFetcher.ts";

export async function fetchTmdbOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  const region = options.countryCode.toUpperCase();
  return fetchMovieEvents(region);
}

import type { CachedEvent } from "../../../caches/EventCache.ts";

/**
 * Options passed to every on-demand event source.
 * The orchestrator geocodes the city name and provides these values.
 */
export interface OnDemandSourceOptions {
  city: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  days: number;
}

/**
 * Descriptor for a registered on-demand event source.
 */
export interface OnDemandEventSource {
  name: string;
  requiresKey: boolean;
  keyField?: string;
  fetch: (options: OnDemandSourceOptions) => Promise<CachedEvent[]>;
}

export type { CachedEvent };

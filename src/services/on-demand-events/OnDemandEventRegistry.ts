import type { OnDemandEventSource } from "./sources/_helpers.ts";
import CONFIG from "../../config.ts";

// ─── Source Imports ─────────────────────────────────────────────

import { fetchTicketmasterOnDemand } from "./sources/ticketmaster.ts";
import { fetchSeatGeekOnDemand } from "./sources/seatgeek.ts";
import { fetchCraigslistOnDemand } from "./sources/craigslist.ts";
import { fetchTmdbOnDemand } from "./sources/tmdb_movies.ts";
import { fetchNhlOnDemand } from "./sources/nhl.ts";
import { fetchNagerHolidaysOnDemand } from "./sources/nager_holidays.ts";
import { fetchDeveloperConferencesOnDemand } from "./sources/developers_events.ts";
import { fetchSportsDbOnDemand } from "./sources/thesportsdb.ts";
import { fetchSpaceDevsOnDemand } from "./sources/spacedevs.ts";
import { fetchArtInstituteChicagoOnDemand } from "./sources/art_institute_chicago.ts";
import { fetchOpenLigaDbOnDemand } from "./sources/openligadb.ts";
import { fetchTvMazeOnDemand } from "./sources/tvmaze.ts";
import { fetchOpenF1OnDemand } from "./sources/openf1.ts";
import { fetchClevelandMuseumOnDemand } from "./sources/cleveland_museum.ts";
import { fetchParisEventsOnDemand } from "./sources/paris_events.ts";
import { fetchNycParksEventsOnDemand } from "./sources/nyc_parks.ts";

// ─── Registry ───────────────────────────────────────────────────

/**
 * Registry of all on-demand event sources. Each entry is a self-contained
 * source descriptor following the webcam pattern.
 *
 * To add a new source:
 * 1. Create a file in `sources/` with a fetch function
 * 2. Import it here
 * 3. Add one entry to this array
 */
const ALL_SOURCES: OnDemandEventSource[] = [
  // ── Sources requiring API keys ────────────────────────────────
  {
    name: "ticketmaster",
    requiresKey: true,
    keyField: "TICKETMASTER_API_KEY",
    fetch: fetchTicketmasterOnDemand,
  },
  {
    name: "seatgeek",
    requiresKey: true,
    keyField: "SEATGEEK_CLIENT_ID",
    fetch: fetchSeatGeekOnDemand,
  },
  {
    name: "tmdb",
    requiresKey: true,
    keyField: "TMDB_API_KEY",
    fetch: fetchTmdbOnDemand,
  },

  // ── Free sources (no API key) ─────────────────────────────────
  {
    name: "craigslist",
    requiresKey: false,
    fetch: fetchCraigslistOnDemand,
  },
  {
    name: "nhl",
    requiresKey: false,
    fetch: fetchNhlOnDemand,
  },
  {
    name: "nager-holidays",
    requiresKey: false,
    fetch: fetchNagerHolidaysOnDemand,
  },
  {
    name: "developer-events",
    requiresKey: false,
    fetch: fetchDeveloperConferencesOnDemand,
  },
  {
    name: "thesportsdb",
    requiresKey: false,
    fetch: fetchSportsDbOnDemand,
  },
  {
    name: "spacedevs",
    requiresKey: false,
    fetch: fetchSpaceDevsOnDemand,
  },
  {
    name: "art-institute-chicago",
    requiresKey: false,
    fetch: fetchArtInstituteChicagoOnDemand,
  },
  {
    name: "openligadb",
    requiresKey: false,
    fetch: fetchOpenLigaDbOnDemand,
  },
  {
    name: "tvmaze",
    requiresKey: false,
    fetch: fetchTvMazeOnDemand,
  },
  {
    name: "openf1",
    requiresKey: false,
    fetch: fetchOpenF1OnDemand,
  },
  {
    name: "cleveland-museum",
    requiresKey: false,
    fetch: fetchClevelandMuseumOnDemand,
  },
  {
    name: "paris-events",
    requiresKey: false,
    fetch: fetchParisEventsOnDemand,
  },
  {
    name: "nyc-parks",
    requiresKey: false,
    fetch: fetchNycParksEventsOnDemand,
  },
];

/**
 * Returns only sources whose required API keys are configured
 * (or that require no key at all).
 */
export function getAvailableSources(): OnDemandEventSource[] {
  return ALL_SOURCES.filter((source) => {
    if (!source.requiresKey) return true;
    if (!source.keyField) return true;
    return !!(CONFIG as unknown as Record<string, unknown>)[source.keyField];
  });
}

export function getAllSourceNames(): string[] {
  return ALL_SOURCES.map((source) => source.name);
}

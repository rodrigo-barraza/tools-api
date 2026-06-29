import {
  EVENT_SOURCES,
  TICKETMASTER_INTERVAL_MS,
  SEATGEEK_INTERVAL_MS,
  CRAIGSLIST_INTERVAL_MS,
  UNIVERSITY_INTERVAL_MS,
  CITY_OF_VANCOUVER_INTERVAL_MS,
  SPORTS_INTERVAL_MS,
  MOVIE_INTERVAL_MS,
  GOOGLE_PLACES_INTERVAL_MS,
} from "../constants.ts";
import { fetchTicketmasterEvents } from "../fetchers/event/TicketmasterFetcher.ts";
import { fetchSeatGeekEvents } from "../fetchers/event/SeatGeekFetcher.ts";
import { fetchCraigslistEvents } from "../fetchers/event/CraigslistFetcher.ts";
import { fetchUniversityEvents } from "../fetchers/event/UniversityFetcher.ts";
import { fetchCityOfVancouverEvents } from "../fetchers/event/CityOfVancouverFetcher.ts";
import { fetchSportsEvents } from "../fetchers/event/SportsFetcher.ts";
import { fetchMovieEvents } from "../fetchers/event/MovieFetcher.ts";
import { fetchGooglePlacesEvents } from "../fetchers/event/GooglePlacesFetcher.ts";
import { updateEvents, setError, restoreEvents } from "../caches/EventCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import { disableToolRuntime } from "../services/ToolSchemaService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// EventCache.CachedEvent is not exported — extract it from the function signature
type CachedEventParam = Parameters<typeof updateEvents>[1];

// Helper for source-based filtering on fetcher results
interface SourcedEvent {
  source: string;
  [key: string]: unknown;
}

// ─── Collector Factory ─────────────────────────────────────────────

function createEventCollector<T>(
  collection: string,
  source: string,
  fetchFunction: () => Promise<T[]>,
) {
  return async function () {
    try {
      const events = await fetchFunction();
      const result = await updateEvents(
        source,
        events as unknown as CachedEventParam,
      );
      await saveState(collection, events);
      logger.info(
        `[${collection}]  ${events.length} events | ${result?.upserted || 0} new, ${result?.modified || 0} updated`,
      );
    } catch (error: unknown) {
      setError(source, { message: errorMessage(error) });
      logger.error(`[${collection}]  ${errorMessage(error)}`);
    }
  };
}

// ─── Simple Collectors ─────────────────────────────────────────────

const collectTicketmaster = createEventCollector(
  "events_ticketmaster",
  EVENT_SOURCES.TICKETMASTER,
  fetchTicketmasterEvents,
);
const collectSeatGeek = createEventCollector(
  "events_seatgeek",
  EVENT_SOURCES.SEATGEEK,
  fetchSeatGeekEvents,
);
const collectCraigslist = createEventCollector(
  "events_craigslist",
  EVENT_SOURCES.CRAIGSLIST,
  fetchCraigslistEvents,
);
const collectCityOfVancouver = createEventCollector(
  "events_city_of_vancouver",
  EVENT_SOURCES.CITY_OF_VANCOUVER,
  fetchCityOfVancouverEvents,
);
const collectMovies = createEventCollector(
  "events_tmdb",
  EVENT_SOURCES.TMDB,
  async () => {
    try {
      return await fetchMovieEvents();
    } catch (error: unknown) {
      const message = errorMessage(error);
      if (message.includes("410")) {
        const tmdbToolNames = [
          "search_media",
          "get_media_details",
          "get_media_credits",
          "get_trending_media",
          "browse_media",
          "get_media_genres",
          "get_now_playing_media",
          "get_media_recommendations",
          "search_person",
          "get_watch_providers",
        ];
        for (const toolName of tmdbToolNames) {
          disableToolRuntime(
            toolName,
            "TMDb API returned 410 Gone (API deprecated)",
          );
        }
      }
      throw error;
    }
  },
);
const collectGooglePlaces = createEventCollector(
  "events_google_places",
  EVENT_SOURCES.GOOGLE_PLACES,
  fetchGooglePlacesEvents,
);

// ─── Multi-Source Collectors ───────────────────────────────────────

async function collectUniversities() {
  try {
    const events = (await fetchUniversityEvents()) as SourcedEvent[];
    const ubcEvents = events.filter(
      (eventItem) => eventItem.source === EVENT_SOURCES.UBC,
    ) as CachedEventParam;
    const sfuEvents = events.filter(
      (eventItem) => eventItem.source === EVENT_SOURCES.SFU,
    ) as CachedEventParam;

    if (ubcEvents.length > 0) {
      const updateResult = await updateEvents(EVENT_SOURCES.UBC, ubcEvents);
      logger.info(
        `[events_universities/UBC] ✅ ${ubcEvents.length} events | ${updateResult?.upserted || 0} new`,
      );
    }
    if (sfuEvents.length > 0) {
      const updateResult = await updateEvents(EVENT_SOURCES.SFU, sfuEvents);
      logger.info(
        `[events_universities/SFU] ✅ ${sfuEvents.length} events | ${updateResult?.upserted || 0} new`,
      );
    }
    if (ubcEvents.length === 0 && sfuEvents.length === 0) {
      logger.info("[events_universities] ✅ 0 events parsed");
    }

    await saveState("events_universities", { ubcEvents, sfuEvents });
  } catch (error: unknown) {
    setError(EVENT_SOURCES.UBC, { message: errorMessage(error) });
    setError(EVENT_SOURCES.SFU, { message: errorMessage(error) });
    logger.error(`[events_universities] ❌ ${errorMessage(error)}`);
  }
}

async function collectSports() {
  try {
    const events = (await fetchSportsEvents()) as SourcedEvent[];
    const nhl = events.filter(
      (eventItem) => eventItem.source === EVENT_SOURCES.NHL,
    ) as CachedEventParam;
    const caps = events.filter(
      (eventItem) => eventItem.source === EVENT_SOURCES.WHITECAPS,
    ) as CachedEventParam;
    const lions = events.filter(
      (eventItem) => eventItem.source === EVENT_SOURCES.BC_LIONS,
    ) as CachedEventParam;

    if (nhl.length > 0) {
      const updateResult = await updateEvents(EVENT_SOURCES.NHL, nhl);
      logger.info(
        `[events_sports/NHL] ✅ ${nhl.length} games | ${updateResult?.upserted || 0} new`,
      );
    }
    if (caps.length > 0) {
      const updateResult = await updateEvents(EVENT_SOURCES.WHITECAPS, caps);
      logger.info(
        `[events_sports/Whitecaps] ✅ ${caps.length} games | ${updateResult?.upserted || 0} new`,
      );
    }
    if (lions.length > 0) {
      const updateResult = await updateEvents(EVENT_SOURCES.BC_LIONS, lions);
      logger.info(
        `[events_sports/Lions] ✅ ${lions.length} games | ${updateResult?.upserted || 0} new`,
      );
    }
    if (events.length === 0) {
      logger.info("[events_sports] ✅ No upcoming games found");
    }

    await saveState("events_sports", { nhl, caps, lions });
  } catch (error: unknown) {
    setError(EVENT_SOURCES.NHL, { message: errorMessage(error) });
    setError(EVENT_SOURCES.WHITECAPS, { message: errorMessage(error) });
    setError(EVENT_SOURCES.BC_LIONS, { message: errorMessage(error) });
    logger.error(`[events_sports] ❌ ${errorMessage(error)}`);
  }
}

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  {
    label: "Ticketmaster",
    collection: "events_ticketmaster",
    source: EVENT_SOURCES.TICKETMASTER,
    ttl: TICKETMASTER_INTERVAL_MS,
    collectFunction: collectTicketmaster,
    delay: 0,
  },
  {
    label: "SeatGeek",
    collection: "events_seatgeek",
    source: EVENT_SOURCES.SEATGEEK,
    ttl: SEATGEEK_INTERVAL_MS,
    collectFunction: collectSeatGeek,
    delay: 3_000,
  },
  {
    label: "Craigslist",
    collection: "events_craigslist",
    source: EVENT_SOURCES.CRAIGSLIST,
    ttl: CRAIGSLIST_INTERVAL_MS,
    collectFunction: collectCraigslist,
    delay: 6_000,
  },
  {
    label: "Universities",
    collection: "events_universities",
    ttl: UNIVERSITY_INTERVAL_MS,
    collectFunction: collectUniversities,
    restoreFunction: (data: Record<string, unknown>) => {
      if ((data.ubcEvents as CachedEventParam)?.length)
        restoreEvents(EVENT_SOURCES.UBC, data.ubcEvents as CachedEventParam);
      if ((data.sfuEvents as CachedEventParam)?.length)
        restoreEvents(EVENT_SOURCES.SFU, data.sfuEvents as CachedEventParam);
    },
    delay: 9_000,
  },
  {
    label: "City of Vancouver",
    collection: "events_city_of_vancouver",
    source: EVENT_SOURCES.CITY_OF_VANCOUVER,
    ttl: CITY_OF_VANCOUVER_INTERVAL_MS,
    collectFunction: collectCityOfVancouver,
    delay: 12_000,
  },
  {
    label: "Sports",
    collection: "events_sports",
    ttl: SPORTS_INTERVAL_MS,
    collectFunction: collectSports,
    restoreFunction: (data: Record<string, unknown>) => {
      if ((data.nhl as CachedEventParam)?.length)
        restoreEvents(EVENT_SOURCES.NHL, data.nhl as CachedEventParam);
      if ((data.caps as CachedEventParam)?.length)
        restoreEvents(EVENT_SOURCES.WHITECAPS, data.caps as CachedEventParam);
      if ((data.lions as CachedEventParam)?.length)
        restoreEvents(EVENT_SOURCES.BC_LIONS, data.lions as CachedEventParam);
    },
    delay: 15_000,
  },
  {
    label: "Movies",
    collection: "events_tmdb",
    source: EVENT_SOURCES.TMDB,
    ttl: MOVIE_INTERVAL_MS,
    collectFunction: collectMovies,
    delay: 18_000,
  },
  {
    label: "Google Places",
    collection: "events_google_places",
    source: EVENT_SOURCES.GOOGLE_PLACES,
    ttl: GOOGLE_PLACES_INTERVAL_MS,
    collectFunction: collectGooglePlaces,
    delay: 21_000,
  },
];

// ─── Start All Event Collectors ────────────────────────────────────

export function startEventCollectors() {
  // Set default restoreFunction for simple event tasks (those with a source key)
  const tasks = STARTUP_TASKS.map((task) => ({
    ...task,
    restoreFunction:
      task.restoreFunction ||
      ((data: CachedEventParam) => restoreEvents(task.source!, data)),
  }));

  startCollectorLoop(tasks);
  logger.info("📅 Event collectors started");
}

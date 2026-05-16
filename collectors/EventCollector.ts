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
import logger from "../logger.ts";

// ─── Collector Factory ─────────────────────────────────────────────

function createEventCollector(collection, source, fetchFn) {
  return async function () {
    try {
      const events = await fetchFn();
      const result = await updateEvents(source, events);
      await saveState(collection, events);
      logger.info(
        `[${collection}] ✅ ${events.length} events | ${result?.upserted || 0} new, ${result?.modified || 0} updated`,
      );
    } catch (error) {
      setError(source, error);
      logger.error(`[${collection}] ❌ ${error.message}`);
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
  fetchMovieEvents,
);
const collectGooglePlaces = createEventCollector(
  "events_google_places",
  EVENT_SOURCES.GOOGLE_PLACES,
  fetchGooglePlacesEvents,
);

// ─── Multi-Source Collectors ───────────────────────────────────────

async function collectUniversities() {
  try {
    const events = await fetchUniversityEvents();
    const ubcEvents = events.filter((e) => e.source === EVENT_SOURCES.UBC);
    const sfuEvents = events.filter((e) => e.source === EVENT_SOURCES.SFU);

    if (ubcEvents.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.UBC, ubcEvents);
      logger.info(
        `[events_universities/UBC] ✅ ${ubcEvents.length} events | ${r?.upserted || 0} new`,
      );
    }
    if (sfuEvents.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.SFU, sfuEvents);
      logger.info(
        `[events_universities/SFU] ✅ ${sfuEvents.length} events | ${r?.upserted || 0} new`,
      );
    }
    if (ubcEvents.length === 0 && sfuEvents.length === 0) {
      logger.info("[events_universities] ✅ 0 events parsed");
    }

    await saveState("events_universities", { ubcEvents, sfuEvents });
  } catch (error) {
    setError(EVENT_SOURCES.UBC, error);
    setError(EVENT_SOURCES.SFU, error);
    logger.error(`[events_universities] ❌ ${error.message}`);
  }
}

async function collectSports() {
  try {
    const events = await fetchSportsEvents();
    const nhl = events.filter((e) => e.source === EVENT_SOURCES.NHL);
    const caps = events.filter((e) => e.source === EVENT_SOURCES.WHITECAPS);
    const lions = events.filter((e) => e.source === EVENT_SOURCES.BC_LIONS);

    if (nhl.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.NHL, nhl);
      logger.info(
        `[events_sports/NHL] ✅ ${nhl.length} games | ${r?.upserted || 0} new`,
      );
    }
    if (caps.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.WHITECAPS, caps);
      logger.info(
        `[events_sports/Whitecaps] ✅ ${caps.length} games | ${r?.upserted || 0} new`,
      );
    }
    if (lions.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.BC_LIONS, lions);
      logger.info(
        `[events_sports/Lions] ✅ ${lions.length} games | ${r?.upserted || 0} new`,
      );
    }
    if (events.length === 0) {
      logger.info("[events_sports] ✅ No upcoming games found");
    }

    await saveState("events_sports", { nhl, caps, lions });
  } catch (error) {
    setError(EVENT_SOURCES.NHL, error);
    setError(EVENT_SOURCES.WHITECAPS, error);
    setError(EVENT_SOURCES.BC_LIONS, error);
    logger.error(`[events_sports] ❌ ${error.message}`);
  }
}

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  {
    label: "Ticketmaster",
    collection: "events_ticketmaster",
    source: EVENT_SOURCES.TICKETMASTER,
    ttl: TICKETMASTER_INTERVAL_MS,
    collectFn: collectTicketmaster,
    delay: 0,
  },
  {
    label: "SeatGeek",
    collection: "events_seatgeek",
    source: EVENT_SOURCES.SEATGEEK,
    ttl: SEATGEEK_INTERVAL_MS,
    collectFn: collectSeatGeek,
    delay: 3_000,
  },
  {
    label: "Craigslist",
    collection: "events_craigslist",
    source: EVENT_SOURCES.CRAIGSLIST,
    ttl: CRAIGSLIST_INTERVAL_MS,
    collectFn: collectCraigslist,
    delay: 6_000,
  },
  {
    label: "Universities",
    collection: "events_universities",
    ttl: UNIVERSITY_INTERVAL_MS,
    collectFn: collectUniversities,
    restoreFn: (data) => {
      if (data.ubcEvents?.length)
        restoreEvents(EVENT_SOURCES.UBC, data.ubcEvents);
      if (data.sfuEvents?.length)
        restoreEvents(EVENT_SOURCES.SFU, data.sfuEvents);
    },
    delay: 9_000,
  },
  {
    label: "City of Vancouver",
    collection: "events_city_of_vancouver",
    source: EVENT_SOURCES.CITY_OF_VANCOUVER,
    ttl: CITY_OF_VANCOUVER_INTERVAL_MS,
    collectFn: collectCityOfVancouver,
    delay: 12_000,
  },
  {
    label: "Sports",
    collection: "events_sports",
    ttl: SPORTS_INTERVAL_MS,
    collectFn: collectSports,
    restoreFn: (data) => {
      if (data.nhl?.length) restoreEvents(EVENT_SOURCES.NHL, data.nhl);
      if (data.caps?.length) restoreEvents(EVENT_SOURCES.WHITECAPS, data.caps);
      if (data.lions?.length)
        restoreEvents(EVENT_SOURCES.BC_LIONS, data.lions);
    },
    delay: 15_000,
  },
  {
    label: "Movies",
    collection: "events_tmdb",
    source: EVENT_SOURCES.TMDB,
    ttl: MOVIE_INTERVAL_MS,
    collectFn: collectMovies,
    delay: 18_000,
  },
  {
    label: "Google Places",
    collection: "events_google_places",
    source: EVENT_SOURCES.GOOGLE_PLACES,
    ttl: GOOGLE_PLACES_INTERVAL_MS,
    collectFn: collectGooglePlaces,
    delay: 21_000,
  },
];

// ─── Start All Event Collectors ────────────────────────────────────

export function startEventCollectors() {
  // Set default restoreFn for simple event tasks (those with a source key)
  const tasks = STARTUP_TASKS.map((task) => ({
    ...task,
    restoreFn: task.restoreFn || ((data) => restoreEvents(task.source, data)),
  }));

  startCollectorLoop(tasks);
  logger.info("📅 Event collectors started");
}


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
} from "../constants.js";
import { fetchTicketmasterEvents } from "../fetchers/event/TicketmasterFetcher.js";
import { fetchSeatGeekEvents } from "../fetchers/event/SeatGeekFetcher.js";
import { fetchCraigslistEvents } from "../fetchers/event/CraigslistFetcher.js";
import { fetchUniversityEvents } from "../fetchers/event/UniversityFetcher.js";
import { fetchCityOfVancouverEvents } from "../fetchers/event/CityOfVancouverFetcher.js";
import { fetchSportsEvents } from "../fetchers/event/SportsFetcher.js";
import { fetchMovieEvents } from "../fetchers/event/MovieFetcher.js";
import { fetchGooglePlacesEvents } from "../fetchers/event/GooglePlacesFetcher.js";
import { updateEvents, setError } from "../caches/EventCache.js";

// ─── Individual Collectors ─────────────────────────────────────────

async function collectTicketmaster() {
  try {
    const events = await fetchTicketmasterEvents();
    const result = await updateEvents(EVENT_SOURCES.TICKETMASTER, events);
    console.log(
      `[Ticketmaster] ✅ ${events.length} events | ${result?.upserted || 0} new, ${result?.modified || 0} updated`,
    );
  } catch (error) {
    setError(EVENT_SOURCES.TICKETMASTER, error);
    console.error(`[Ticketmaster] ❌ ${error.message}`);
  }
}

async function collectSeatGeek() {
  try {
    const events = await fetchSeatGeekEvents();
    const result = await updateEvents(EVENT_SOURCES.SEATGEEK, events);
    console.log(
      `[SeatGeek] ✅ ${events.length} events | ${result?.upserted || 0} new, ${result?.modified || 0} updated`,
    );
  } catch (error) {
    setError(EVENT_SOURCES.SEATGEEK, error);
    console.error(`[SeatGeek] ❌ ${error.message}`);
  }
}

async function collectCraigslist() {
  try {
    const events = await fetchCraigslistEvents();
    const result = await updateEvents(EVENT_SOURCES.CRAIGSLIST, events);
    console.log(
      `[Craigslist] ✅ ${events.length} events | ${result?.upserted || 0} new, ${result?.modified || 0} updated`,
    );
  } catch (error) {
    setError(EVENT_SOURCES.CRAIGSLIST, error);
    console.error(`[Craigslist] ❌ ${error.message}`);
  }
}

async function collectUniversities() {
  try {
    const events = await fetchUniversityEvents();
    const ubcEvents = events.filter((e) => e.source === EVENT_SOURCES.UBC);
    const sfuEvents = events.filter((e) => e.source === EVENT_SOURCES.SFU);

    if (ubcEvents.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.UBC, ubcEvents);
      console.log(
        `[UBC] ✅ ${ubcEvents.length} events | ${r?.upserted || 0} new`,
      );
    }
    if (sfuEvents.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.SFU, sfuEvents);
      console.log(
        `[SFU] ✅ ${sfuEvents.length} events | ${r?.upserted || 0} new`,
      );
    }
    if (ubcEvents.length === 0 && sfuEvents.length === 0) {
      console.log("[Universities] ✅ 0 events parsed");
    }
  } catch (error) {
    setError(EVENT_SOURCES.UBC, error);
    setError(EVENT_SOURCES.SFU, error);
    console.error(`[Universities] ❌ ${error.message}`);
  }
}

async function collectCityOfVancouver() {
  try {
    const events = await fetchCityOfVancouverEvents();
    const result = await updateEvents(EVENT_SOURCES.CITY_OF_VANCOUVER, events);
    console.log(
      `[City of Vancouver] ✅ ${events.length} events | ${result?.upserted || 0} new`,
    );
  } catch (error) {
    setError(EVENT_SOURCES.CITY_OF_VANCOUVER, error);
    console.error(`[City of Vancouver] ❌ ${error.message}`);
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
      console.log(`[Canucks] ✅ ${nhl.length} games | ${r?.upserted || 0} new`);
    }
    if (caps.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.WHITECAPS, caps);
      console.log(
        `[Whitecaps] ✅ ${caps.length} games | ${r?.upserted || 0} new`,
      );
    }
    if (lions.length > 0) {
      const r = await updateEvents(EVENT_SOURCES.BC_LIONS, lions);
      console.log(
        `[BC Lions] ✅ ${lions.length} games | ${r?.upserted || 0} new`,
      );
    }
    if (events.length === 0) {
      console.log("[Sports] ✅ No upcoming games found");
    }
  } catch (error) {
    setError(EVENT_SOURCES.NHL, error);
    setError(EVENT_SOURCES.WHITECAPS, error);
    setError(EVENT_SOURCES.BC_LIONS, error);
    console.error(`[Sports] ❌ ${error.message}`);
  }
}

async function collectMovies() {
  try {
    const events = await fetchMovieEvents();
    const result = await updateEvents(EVENT_SOURCES.TMDB, events);
    console.log(
      `[Movies] ✅ ${events.length} films | ${result?.upserted || 0} new, ${result?.modified || 0} updated`,
    );
  } catch (error) {
    setError(EVENT_SOURCES.TMDB, error);
    console.error(`[Movies] ❌ ${error.message}`);
  }
}

async function collectGooglePlaces() {
  try {
    const events = await fetchGooglePlacesEvents();
    const result = await updateEvents(EVENT_SOURCES.GOOGLE_PLACES, events);
    console.log(
      `[Google Places] ✅ ${events.length} venues | ${result?.upserted || 0} new`,
    );
  } catch (error) {
    setError(EVENT_SOURCES.GOOGLE_PLACES, error);
    console.error(`[Google Places] ❌ ${error.message}`);
  }
}

// ─── Start All Event Collectors ────────────────────────────────────

export function startEventCollectors() {
  // Staggered initial fetch
  collectTicketmaster();
  setTimeout(collectSeatGeek, 3_000);
  setTimeout(collectCraigslist, 6_000);
  setTimeout(collectUniversities, 9_000);
  setTimeout(collectCityOfVancouver, 12_000);
  setTimeout(collectSports, 15_000);
  setTimeout(collectMovies, 18_000);
  setTimeout(collectGooglePlaces, 21_000);

  // Recurring intervals
  setInterval(collectTicketmaster, TICKETMASTER_INTERVAL_MS);
  setInterval(collectSeatGeek, SEATGEEK_INTERVAL_MS);
  setInterval(collectCraigslist, CRAIGSLIST_INTERVAL_MS);
  setInterval(collectUniversities, UNIVERSITY_INTERVAL_MS);
  setInterval(collectCityOfVancouver, CITY_OF_VANCOUVER_INTERVAL_MS);
  setInterval(collectSports, SPORTS_INTERVAL_MS);
  setInterval(collectMovies, MOVIE_INTERVAL_MS);
  setInterval(collectGooglePlaces, GOOGLE_PLACES_INTERVAL_MS);

  console.log("📅 Event collectors started");
}

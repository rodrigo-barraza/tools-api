import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.js";

// NHL unofficial API — no auth needed
const NHL_SCHEDULE_URL =
  "https://api-web.nhle.com/v1/club-schedule/VAN/week/now";
const NHL_MONTH_URL = "https://api-web.nhle.com/v1/club-schedule/VAN/month/now";

// TheSportsDB — free API key "123"
const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/123";
const WHITECAPS_ID = "134147"; // Vancouver Whitecaps FC
const BC_LIONS_ID = "135006"; // BC Lions CFL

/**
 * Fetch Vancouver Canucks games from the NHL API.
 */
async function fetchCanucksGames() {
  // Try month schedule first for more coverage, fall back to week
  let response = await fetch(NHL_MONTH_URL);

  if (!response.ok) {
    response = await fetch(NHL_SCHEDULE_URL);
    if (!response.ok) {
      throw new Error(`NHL API returned ${response.status}`);
    }
  }

  const data = await response.json();
  const games = data.games || [];

  return games.map((game) => {
    const isHome = game.homeTeam?.abbrev === "VAN";
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    const opponentName =
      `${opponent?.placeName?.default || ""} ${opponent?.commonName?.default || ""}`.trim();

    return {
      sourceId: `nhl-${game.id}`,
      source: EVENT_SOURCES.NHL,
      name: isHome ? `Canucks vs ${opponentName}` : `Canucks @ ${opponentName}`,
      description: `${game.season} NHL Regular Season${game.tvBroadcasts?.length ? ` — ${game.tvBroadcasts.map((b) => b.network).join(", ")}` : ""}`,
      url:
        game.ticketsLink || `https://www.nhl.com${game.gameCenterLink || ""}`,
      imageUrl: isHome ? opponent?.logo || null : game.homeTeam?.logo || null,
      startDate: game.startTimeUTC ? new Date(game.startTimeUTC) : null,
      endDate: null,
      venue: {
        name: game.venue?.default || "Rogers Arena",
        address: null,
        city: isHome ? "Vancouver" : null,
        state: isHome ? "BC" : null,
        country: "CA",
        latitude: isHome ? 49.2778 : null,
        longitude: isHome ? -123.1089 : null,
      },
      category: EVENT_CATEGORIES.SPORTS,
      genres: ["hockey", "NHL"],
      priceRange: null,
      status: game.gameState === "FUT" ? "onsale" : "onsale",
      fetchedAt: new Date(),
    };
  });
}

/**
 * Fetch upcoming events for a team from TheSportsDB.
 */
async function fetchSportsDbEvents(teamId, source, teamName, sport) {
  const url = `${SPORTSDB_BASE}/eventsnext.php?id=${teamId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TheSportsDB returned ${response.status} for ${teamName}`);
  }

  const data = await response.json();
  const events = data.events || [];

  return events.map((event) => {
    const isHome = event.idHomeTeam === teamId;
    const venueName = event.strVenue || null;

    return {
      sourceId: `sportsdb-${event.idEvent}`,
      source,
      name: event.strEvent || `${teamName} Game`,
      description:
        `${event.strLeague || sport} — ${event.strSeason || ""}`.trim(),
      url: null,
      imageUrl: event.strThumb || event.strBanner || null,
      startDate: event.strTimestamp
        ? new Date(event.strTimestamp)
        : event.dateEvent
          ? new Date(event.dateEvent)
          : null,
      endDate: null,
      venue: {
        name: venueName,
        address: null,
        city: isHome ? "Vancouver" : event.strCity || null,
        state: isHome ? "BC" : null,
        country: event.strCountry || "CA",
        latitude: null,
        longitude: null,
      },
      category: EVENT_CATEGORIES.SPORTS,
      genres: [sport],
      priceRange: null,
      status: "onsale",
      fetchedAt: new Date(),
    };
  });
}

/**
 * Fetch all Vancouver sports events.
 * Combines Canucks (NHL API), Whitecaps (TheSportsDB), and BC Lions (TheSportsDB).
 */
export async function fetchSportsEvents() {
  const results = await Promise.allSettled([
    fetchCanucksGames(),
    fetchSportsDbEvents(
      WHITECAPS_ID,
      EVENT_SOURCES.WHITECAPS,
      "Whitecaps",
      "soccer",
    ),
    fetchSportsDbEvents(
      BC_LIONS_ID,
      EVENT_SOURCES.BC_LIONS,
      "BC Lions",
      "football",
    ),
  ]);

  const events = [];
  const labels = ["Canucks", "Whitecaps", "BC Lions"];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      console.warn(`[Sports] ⚠️ ${labels[i]}: ${result.reason?.message}`);
    }
  });

  return events;
}

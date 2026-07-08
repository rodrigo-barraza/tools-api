import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

interface SportsDbTeam {
  idTeam: string;
  strTeam: string;
  strSport: string;
  strLeague: string;
  strStadium: string;
  strStadiumLocation: string;
}

interface SportsDbEvent {
  idEvent: string;
  strEvent: string;
  strSport: string;
  strLeague: string;
  dateEvent: string;
  strTime: string;
  strVenue: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strThumb: string | null;
}

/**
 * Fetch upcoming sports events from TheSportsDB. No real API key required
 * (uses public key "3"). Covers NFL, NBA, MLB, MLS, Premier League, etc.
 *
 * Workflow: search teams by city name → get upcoming events per team.
 */
export async function fetchSportsDbOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  // Step 1: Search teams by city name
  const teamSearchResponse = await fetch(
    `${SPORTSDB_BASE}/searchteams.php?t=${encodeURIComponent(options.city)}`,
  );
  if (!teamSearchResponse.ok) return [];

  const teamData = await teamSearchResponse.json();
  const teams: SportsDbTeam[] = teamData.teams || [];

  if (teams.length === 0) return [];

  // Step 2: Get upcoming events for each team (max 5 teams to stay within rate limits)
  const teamSlice = teams.slice(0, 5);
  const eventPromises = teamSlice.map(async (team) => {
    try {
      const eventResponse = await fetch(
        `${SPORTSDB_BASE}/eventsnext.php?id=${team.idTeam}`,
      );
      if (!eventResponse.ok) return [];

      const eventData = await eventResponse.json();
      return (eventData.events || []) as SportsDbEvent[];
    } catch {
      return [];
    }
  });

  const allTeamEvents = await Promise.all(eventPromises);
  const flatEvents = allTeamEvents.flat();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + options.days);

  return flatEvents
    .filter((event) => {
      if (!event.dateEvent) return false;
      const eventDate = new Date(event.dateEvent);
      return eventDate <= cutoffDate;
    })
    .map((event) => ({
      name: event.strEvent,
      source: "thesportsdb",
      sourceId: `sportsdb-${event.idEvent}`,
      category: "sports",
      startDate: new Date(
        event.strTime
          ? `${event.dateEvent}T${event.strTime}`
          : event.dateEvent,
      ),
      sport: event.strSport,
      league: event.strLeague,
      venue: { name: event.strVenue },
      homeTeam: event.strHomeTeam,
      awayTeam: event.strAwayTeam,
      imageUrl: event.strThumb,
    }));
}

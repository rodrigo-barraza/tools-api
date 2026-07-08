import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";

const NHL_SCHEDULE_BASE = "https://api-web.nhle.com/v1/schedule";

interface NhlGame {
  id: number;
  startTimeUTC: string;
  gameType: number;
  venue: { default: string };
  homeTeam: {
    placeName: { default: string };
    commonName: { default: string };
    abbrev: string;
  };
  awayTeam: {
    placeName: { default: string };
    commonName: { default: string };
    abbrev: string;
  };
}

interface NhlGameDay {
  date: string;
  games: NhlGame[];
}

interface NhlScheduleResponse {
  gameWeek: NhlGameDay[];
}

function cityMatchesTeam(city: string, placeName: string): boolean {
  const normalizedCity = city.toLowerCase();
  const normalizedPlace = placeName.toLowerCase();
  return (
    normalizedPlace.includes(normalizedCity) ||
    normalizedCity.includes(normalizedPlace)
  );
}

/**
 * Fetch NHL game schedule. No API key required.
 * Filters games where the requested city matches a team's home city.
 * Returns all games in the schedule window if no city match (global mode).
 */
export async function fetchNhlOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  const today = new Date();
  const scheduleDate = today.toISOString().slice(0, 10);

  const response = await fetch(`${NHL_SCHEDULE_BASE}/${scheduleDate}`);
  if (!response.ok) return [];

  const data: NhlScheduleResponse = await response.json();
  const gameWeek = data.gameWeek || [];
  const events: CachedEvent[] = [];

  for (const day of gameWeek) {
    for (const game of day.games) {
      const homePlaceName = game.homeTeam?.placeName?.default || "";
      const awayPlaceName = game.awayTeam?.placeName?.default || "";
      const homeTeamName = game.homeTeam?.commonName?.default || "";
      const awayTeamName = game.awayTeam?.commonName?.default || "";

      const isRelevant =
        cityMatchesTeam(options.city, homePlaceName) ||
        cityMatchesTeam(options.city, awayPlaceName);

      if (!isRelevant) continue;

      events.push({
        name: `${awayPlaceName} ${awayTeamName} @ ${homePlaceName} ${homeTeamName}`,
        source: "nhl",
        sourceId: `nhl-${game.id}`,
        category: "sports",
        startDate: new Date(game.startTimeUTC),
        venue: { name: game.venue?.default },
        url: `https://www.nhl.com/gamecenter/${game.id}`,
      });
    }
  }

  return events;
}

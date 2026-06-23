// ─── Steam Web API Client ───────────────────────────────────

import CONFIG from "../../config.ts";

const STEAM_API_BASE_URL = "https://api.steampowered.com";

// ─── External API Response Types ────────────────────────────

interface SteamPlayerSummary {
  steamid: string;
  communityvisibilitystate: number;
  profilestate?: number;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarhash: string;
  lastlogoff?: number;
  personastate: number;
  realname?: string;
  primaryclanid?: string;
  timecreated?: number;
  personastateflags?: number;
  loccountrycode?: string;
  locstatecode?: string;
  loccityid?: number;
  gameextrainfo?: string;
  gameid?: string;
}

interface SteamOwnedGame {
  appid: number;
  name?: string;
  playtime_forever: number;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
  has_community_visible_stats?: boolean;
}

interface SteamRecentGame {
  appid: number;
  name: string;
  playtime_2weeks: number;
  playtime_forever: number;
  img_icon_url?: string;
}

interface SteamPlayerBans {
  SteamId: string;
  CommunityBanned: boolean;
  VACBanned: boolean;
  NumberOfVACBans: number;
  DaysSinceLastBan: number;
  NumberOfGameBans: number;
  EconomyBan: string;
}

// ─── Persona State Labels ───────────────────────────────────

const PERSONA_STATE_LABELS: Record<number, string> = {
  0: "Offline",
  1: "Online",
  2: "Busy",
  3: "Away",
  4: "Snooze",
  5: "Looking to Trade",
  6: "Looking to Play",
};

const VISIBILITY_LABELS: Record<number, string> = {
  1: "Private",
  2: "Friends Only",
  3: "Public",
};

// ─── API Helpers ────────────────────────────────────────────

function getApiKey(): string {
  const apiKey = CONFIG.STEAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Steam Web API key not configured. Set STEAM_API_KEY in your environment variables. " +
        "Get a free key at https://steamcommunity.com/dev/apikey",
    );
  }
  return apiKey;
}

function isSteam64Id(input: string): boolean {
  return /^\d{17}$/.test(input);
}

async function fetchSteamJson<T = Record<string, unknown>>(
  path: string,
): Promise<T> {
  const response = await fetch(`${STEAM_API_BASE_URL}${path}`);
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Steam API error ${response.status}: ${responseText.slice(0, 200)}`,
    );
  }
  return response.json() as Promise<T>;
}

// ─── Vanity URL Resolution ──────────────────────────────────

export async function resolveVanityUrl(
  vanityName: string,
): Promise<string> {
  const apiKey = getApiKey();
  const result = await fetchSteamJson<{
    response: { steamid?: string; success: number; message?: string };
  }>(
    `/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityName)}`,
  );

  if (result.response.success !== 1 || !result.response.steamid) {
    throw new Error(
      `Could not resolve vanity URL "${vanityName}": ${result.response.message || "No match found"}`,
    );
  }
  return result.response.steamid;
}

async function resolveSteamId(steamIdOrVanity: string): Promise<string> {
  if (isSteam64Id(steamIdOrVanity)) {
    return steamIdOrVanity;
  }
  return resolveVanityUrl(steamIdOrVanity);
}

// ─── Player Profile ─────────────────────────────────────────

export async function getPlayerProfile(steamIdOrVanity: string) {
  const apiKey = getApiKey();
  const steamId = await resolveSteamId(steamIdOrVanity);

  const result = await fetchSteamJson<{
    response: { players: SteamPlayerSummary[] };
  }>(
    `/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`,
  );

  const player = result.response.players[0];
  if (!player) {
    throw new Error(`No Steam profile found for ID: ${steamId}`);
  }

  return {
    steamId: player.steamid,
    personaName: player.personaname,
    realName: player.realname || null,
    profileUrl: player.profileurl,
    avatar: player.avatarfull,
    personaState: PERSONA_STATE_LABELS[player.personastate] || "Unknown",
    visibility:
      VISIBILITY_LABELS[player.communityvisibilitystate] || "Unknown",
    isProfileConfigured: player.profilestate === 1,
    countryCode: player.loccountrycode || null,
    stateCode: player.locstatecode || null,
    accountCreated: player.timecreated
      ? new Date(player.timecreated * 1000).toISOString()
      : null,
    lastLogoff: player.lastlogoff
      ? new Date(player.lastlogoff * 1000).toISOString()
      : null,
    currentlyPlaying: player.gameextrainfo || null,
    currentGameId: player.gameid || null,
  };
}

// ─── Owned Games ────────────────────────────────────────────

export async function getOwnedGames(
  steamIdOrVanity: string,
  limit = 25,
) {
  const apiKey = getApiKey();
  const steamId = await resolveSteamId(steamIdOrVanity);

  const result = await fetchSteamJson<{
    response: { game_count?: number; games?: SteamOwnedGame[] };
  }>(
    `/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`,
  );

  const allGames = result.response.games || [];
  const totalGameCount = result.response.game_count || 0;

  const sortedByPlaytime = [...allGames].sort(
    (gameA, gameB) => gameB.playtime_forever - gameA.playtime_forever,
  );

  const games = sortedByPlaytime.slice(0, limit).map((game) => ({
    appId: game.appid,
    name: game.name || `App ${game.appid}`,
    playtimeHours: parseFloat((game.playtime_forever / 60).toFixed(1)),
    playtimeRecentHours: game.playtime_2weeks
      ? parseFloat((game.playtime_2weeks / 60).toFixed(1))
      : 0,
    iconUrl: game.img_icon_url
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
      : null,
    hasCommunityStats: game.has_community_visible_stats || false,
  }));

  const totalPlaytimeHours = parseFloat(
    (
      allGames.reduce(
        (totalMinutes, game) => totalMinutes + game.playtime_forever,
        0,
      ) / 60
    ).toFixed(1),
  );

  return {
    steamId,
    totalGames: totalGameCount,
    totalPlaytimeHours,
    showing: games.length,
    games,
  };
}

// ─── Recently Played Games ──────────────────────────────────

export async function getRecentlyPlayedGames(
  steamIdOrVanity: string,
  limit = 10,
) {
  const apiKey = getApiKey();
  const steamId = await resolveSteamId(steamIdOrVanity);

  const result = await fetchSteamJson<{
    response: { total_count?: number; games?: SteamRecentGame[] };
  }>(
    `/IPlayerService/GetRecentlyPlayedGames/v1/?key=${apiKey}&steamid=${steamId}&count=${limit}&format=json`,
  );

  const games = (result.response.games || []).map((game) => ({
    appId: game.appid,
    name: game.name,
    playtimeRecentHours: parseFloat((game.playtime_2weeks / 60).toFixed(1)),
    playtimeTotalHours: parseFloat((game.playtime_forever / 60).toFixed(1)),
    iconUrl: game.img_icon_url
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
      : null,
  }));

  return {
    steamId,
    totalRecentGames: result.response.total_count || 0,
    games,
  };
}

// ─── Player Bans ────────────────────────────────────────────

export async function getPlayerBans(steamIdOrVanity: string) {
  const apiKey = getApiKey();
  const steamId = await resolveSteamId(steamIdOrVanity);

  const result = await fetchSteamJson<{
    players: SteamPlayerBans[];
  }>(
    `/ISteamUser/GetPlayerBans/v1/?key=${apiKey}&steamids=${steamId}`,
  );

  const banInfo = result.players[0];
  if (!banInfo) {
    throw new Error(`No ban data found for Steam ID: ${steamId}`);
  }

  return {
    steamId: banInfo.SteamId,
    isCommunityBanned: banInfo.CommunityBanned,
    isVacBanned: banInfo.VACBanned,
    vacBanCount: banInfo.NumberOfVACBans,
    daysSinceLastBan: banInfo.DaysSinceLastBan,
    gameBanCount: banInfo.NumberOfGameBans,
    economyBanStatus: banInfo.EconomyBan,
    isClean:
      !banInfo.CommunityBanned &&
      !banInfo.VACBanned &&
      banInfo.NumberOfGameBans === 0 &&
      banInfo.EconomyBan === "none",
  };
}

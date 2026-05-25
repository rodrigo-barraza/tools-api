// ─── OpenDota API Client ────────────────────────────────────

import { MS_PER_DAY } from "@rodrigo-barraza/utilities-library";

const BASE_URL = "https://api.opendota.com/api";

// ─── External API Response Types ────────────────────────────

interface OpenDotaHero {
  id: number;
  localized_name: string;
  name: string;
  primary_attr: string;
  attack_type: string;
  roles: string[];
  legs: number;
}

interface OpenDotaHeroStats extends OpenDotaHero {
  img?: string;
  icon?: string;
  base_health: number;
  base_mana: number;
  base_armor: number;
  base_attack_min: number;
  base_attack_max: number;
  move_speed: number;
  pro_win: number;
  pro_pick: number;
  turbo_picks: number;
  turbo_wins: number;
}

interface OpenDotaMatchup {
  hero_id: number;
  games_played: number;
  wins: number;
}

interface OpenDotaPlayer {
  profile?: {
    account_id?: number;
    personaname?: string;
    avatarfull?: string;
    steamid?: string;
    profileurl?: string;
    loccountrycode?: string;
  };
  mmr_estimate?: { estimate?: number };
  rank_tier?: number;
  leaderboard_rank?: number;
}

interface OpenDotaWinLoss {
  win: number;
  lose: number;
}

interface OpenDotaRecentMatch {
  match_id: number;
  hero_id: number;
  duration: number;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  xp_per_min: number;
  gold_per_min: number;
  player_slot: number;
  radiant_win: boolean;
  start_time: number;
}

interface OpenDotaMatchPlayer {
  account_id?: number;
  personaname?: string;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gold_per_min: number;
  xp_per_min: number;
  hero_damage: number;
  tower_damage: number;
  hero_healing: number;
  level: number;
  isRadiant: boolean;
}

interface OpenDotaMatch {
  match_id: number;
  duration: number;
  radiant_win: boolean;
  radiant_score: number;
  dire_score: number;
  start_time: number;
  game_mode: number;
  lobby_type: number;
  region: number;
  players: OpenDotaMatchPlayer[];
}

interface OpenDotaProMatch {
  match_id: number;
  duration: number;
  radiant_name?: string;
  dire_name?: string;
  radiant_win: boolean;
  radiant_score: number;
  dire_score: number;
  league_name?: string;
  start_time: number;
}

// Cache hero list in memory (static data, changes only on patches)
let heroCache: TransformedHero[] | null = null;
let heroCacheTime = 0;
const HERO_CACHE_TTL = MS_PER_DAY;

async function fetchJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenDota API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

// ─── Transformed Types ──────────────────────────────────────

interface TransformedHero {
  id: number;
  name: string;
  internalName: string;
  primaryAttr: string;
  attackType: string;
  roles: string[];
  img: string;
  icon: string;
  baseHealth: number;
  baseMana: number;
  baseArmor: number;
  baseAttackMin: number;
  baseAttackMax: number;
  moveSpeed: number;
  legs: number;
  proWinRate: string | null;
  proPick: number;
  turboPick: number;
  turboWinRate: string | null;
}

interface TransformedMatchup {
  heroId: number;
  gamesPlayed: number;
  wins: number;
  winRate: string;
}

// ── Hero Data ──────────────────────────────────────────────────

/**
 * Get all heroes with stats.
 */
export async function getHeroes(): Promise<TransformedHero[]> {
  const now = Date.now();
  if (heroCache && now - heroCacheTime < HERO_CACHE_TTL) return heroCache;

  const [heroes, stats] = await Promise.all([
    fetchJson<OpenDotaHero[]>("/heroes"),
    fetchJson<OpenDotaHeroStats[]>("/heroStats"),
  ]);

  // Merge stats into hero objects
  const statsMap = new Map(stats.map((statEntry) => [statEntry.id, statEntry]));
  heroCache = heroes.map((hero) => {
    const heroStats = statsMap.get(hero.id) || ({} as Partial<OpenDotaHeroStats>);
    return {
      id: hero.id,
      name: hero.localized_name,
      internalName: hero.name,
      primaryAttr: hero.primary_attr,
      attackType: hero.attack_type,
      roles: hero.roles,
      img: `https://cdn.cloudflare.steamstatic.com${heroStats.img || ""}`,
      icon: `https://cdn.cloudflare.steamstatic.com${heroStats.icon || ""}`,
      baseHealth: heroStats.base_health || 0,
      baseMana: heroStats.base_mana || 0,
      baseArmor: heroStats.base_armor || 0,
      baseAttackMin: heroStats.base_attack_min || 0,
      baseAttackMax: heroStats.base_attack_max || 0,
      moveSpeed: heroStats.move_speed || 0,
      legs: hero.legs,
      // Win rates across brackets
      proWinRate: heroStats.pro_pick ? (((heroStats.pro_win || 0) / heroStats.pro_pick) * 100).toFixed(1) + "%" : null,
      proPick: heroStats.pro_pick || 0,
      turboPick: heroStats.turbo_picks || 0,
      turboWinRate: heroStats.turbo_picks ? (((heroStats.turbo_wins || 0) / heroStats.turbo_picks) * 100).toFixed(1) + "%" : null,
    };
  });
  heroCacheTime = now;
  return heroCache;
}

/**
 * Get a single hero by name or ID.
 */
export async function getHero(query: string | number) {
  const heroes = await getHeroes();
  const normalizedQuery = String(query).toLowerCase();

  // Try ID match first
  const byId = heroes.find((hero) => hero.id === parseInt(String(query)));
  if (byId) return byId;

  // Exact name match
  const exact = heroes.find((hero) => hero.name.toLowerCase() === normalizedQuery);
  if (exact) return exact;

  // Partial name match
  const partial = heroes.filter((hero) => hero.name.toLowerCase().includes(normalizedQuery));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    return {
      ambiguous: true,
      matches: partial.map((hero) => ({ id: hero.id, name: hero.name })),
      hint: "Multiple heroes matched. Use the exact name or hero ID.",
    };
  }

  return null;
}

// ── Hero Matchups ────────────────────────────────────────────────

/**
 * Get hero matchup data (best/worst opponents).
 */
export async function getHeroMatchups(heroId: number | string) {
  const matchups = await fetchJson<OpenDotaMatchup[]>(`/heroes/${heroId}/matchups`);

  // Sort by win rate to find best/worst
  const withRates: TransformedMatchup[] = matchups
    .filter((matchupEntry) => matchupEntry.games_played >= 50)
    .map((matchupEntry) => ({
      heroId: matchupEntry.hero_id,
      gamesPlayed: matchupEntry.games_played,
      wins: matchupEntry.wins,
      winRate: ((matchupEntry.wins / matchupEntry.games_played) * 100).toFixed(1) + "%",
    }));

  const sorted = [...withRates].sort(
    (a, b) => parseFloat(b.winRate) - parseFloat(a.winRate),
  );

  return {
    heroId,
    bestAgainst: sorted.slice(0, 10),
    worstAgainst: sorted.slice(-10).reverse(),
    totalMatchups: matchups.length,
  };
}

// ── Player Data ────────────────────────────────────────────────

/**
 * Get player profile by Steam account ID.
 */
export async function getPlayer(accountId: number | string) {
  const [profile, wl] = await Promise.all([
    fetchJson<OpenDotaPlayer>(`/players/${accountId}`),
    fetchJson<OpenDotaWinLoss>(`/players/${accountId}/wl`),
  ]);

  return {
    accountId: profile.profile?.account_id,
    personaName: profile.profile?.personaname,
    avatar: profile.profile?.avatarfull,
    steamId: profile.profile?.steamid,
    profileUrl: profile.profile?.profileurl,
    countryCode: profile.profile?.loccountrycode,
    mmrEstimate: profile.mmr_estimate?.estimate,
    rank: profile.rank_tier,
    leaderboardRank: profile.leaderboard_rank,
    wins: wl.win,
    losses: wl.lose,
    winRate: wl.win + wl.lose > 0
      ? (((wl.win / (wl.win + wl.lose)) * 100).toFixed(1) + "%")
      : null,
    totalGames: wl.win + wl.lose,
  };
}

/**
 * Get player's recent matches.
 */
export async function getPlayerRecentMatches(accountId: number | string, limit = 10) {
  const matches = await fetchJson<OpenDotaRecentMatch[]>(`/players/${accountId}/recentMatches`);
  return matches.slice(0, limit).map((matchEntry) => ({
    matchId: matchEntry.match_id,
    heroId: matchEntry.hero_id,
    duration: matchEntry.duration,
    durationMinutes: Math.round(matchEntry.duration / 60),
    kills: matchEntry.kills,
    deaths: matchEntry.deaths,
    assists: matchEntry.assists,
    kda: matchEntry.deaths > 0
      ? ((matchEntry.kills + matchEntry.assists) / matchEntry.deaths).toFixed(1)
      : (matchEntry.kills + matchEntry.assists).toFixed(1),
    lastHits: matchEntry.last_hits,
    denies: matchEntry.denies,
    xpm: matchEntry.xp_per_min,
    gpm: matchEntry.gold_per_min,
    playerSlot: matchEntry.player_slot,
    radiantWin: matchEntry.radiant_win,
    won: (matchEntry.player_slot < 128) === matchEntry.radiant_win,
    startTime: new Date(matchEntry.start_time * 1000).toISOString(),
  }));
}

// ── Match Data ─────────────────────────────────────────────────

/**
 * Get match details by match ID.
 */
export async function getMatch(matchId: number | string) {
  const matchData = await fetchJson<OpenDotaMatch>(`/matches/${matchId}`);

  return {
    matchId: matchData.match_id,
    duration: matchData.duration,
    durationMinutes: Math.round(matchData.duration / 60),
    radiantWin: matchData.radiant_win,
    radiantScore: matchData.radiant_score,
    direScore: matchData.dire_score,
    startTime: new Date(matchData.start_time * 1000).toISOString(),
    gameMode: matchData.game_mode,
    lobbyType: matchData.lobby_type,
    region: matchData.region,
    players: (matchData.players || []).map((player: OpenDotaMatchPlayer) => ({
      accountId: player.account_id,
      personaName: player.personaname,
      heroId: player.hero_id,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      lastHits: player.last_hits,
      denies: player.denies,
      gpm: player.gold_per_min,
      xpm: player.xp_per_min,
      heroDamage: player.hero_damage,
      towerDamage: player.tower_damage,
      heroHealing: player.hero_healing,
      level: player.level,
      isRadiant: player.isRadiant,
      won: player.isRadiant === matchData.radiant_win,
    })),
  };
}

// ── Pro Matches ────────────────────────────────────────────────

/**
 * Get recent professional matches.
 */
export async function getProMatches(limit = 10) {
  const matches = await fetchJson<OpenDotaProMatch[]>("/proMatches");
  return matches.slice(0, limit).map((matchEntry) => ({
    matchId: matchEntry.match_id,
    duration: matchEntry.duration,
    durationMinutes: Math.round(matchEntry.duration / 60),
    radiantName: matchEntry.radiant_name,
    direName: matchEntry.dire_name,
    radiantWin: matchEntry.radiant_win,
    radiantScore: matchEntry.radiant_score,
    direScore: matchEntry.dire_score,
    leagueName: matchEntry.league_name,
    startTime: new Date(matchEntry.start_time * 1000).toISOString(),
  }));
}

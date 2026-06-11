import { JIKAN_BASE_URL } from "../../constants.ts";
import { JikanAnime, RawJikanAnime } from "../../types/knowledge.ts";

/**
 * Jikan API Fetcher (MyAnimeList unofficial API v4)
 * https://docs.api.jikan.moe/
 */

// ─── Helpers ───────────────────────────────────────────────────────

function normalizeAnime(
  anime: RawJikanAnime | null | undefined,
): JikanAnime | null {
  if (!anime) return null;
  return {
    malId: anime.mal_id || null,
    title: anime.title || null,
    titleEnglish: anime.title_english || null,
    titleJapanese: anime.title_japanese || null,
    imageUrl:
      anime.images?.jpg?.large_image_url ||
      anime.images?.jpg?.image_url ||
      null,
    trailerUrl: anime.trailer?.url || null,
    synopsis: anime.synopsis ? anime.synopsis.substring(0, 1000) : null,
    type: anime.type || null,
    source: anime.source || null,
    episodes: anime.episodes || null,
    status: anime.status || null,
    airing: anime.airing || false,
    airedString: anime.aired?.string || null,
    duration: anime.duration || null,
    rating: anime.rating || null,
    score: anime.score || null,
    scoredBy: anime.scored_by || null,
    rank: anime.rank || null,
    popularity: anime.popularity || null,
    season: anime.season || null,
    year: anime.year || null,
    studios: (anime.studios || []).map((s) => s.name),
    genres: (anime.genres || []).map((g) => g.name),
    themes: (anime.themes || []).map((theme) => theme.name),
  };
}

/**
 * Handle Jikan API rate limiting via delays and standard fetch wrapper.
 */
async function fetchJikan<T>(endpoint: string): Promise<T | null> {
  const url = `${JIKAN_BASE_URL}${endpoint}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Jikan API → ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as T;
}

// ─── Fetchers ──────────────────────────────────────────────────────

/**
 * Search anime by title
 */
export async function searchAnime(value: string, limit: number = 10) {
  const endpoint = `/anime?q=${encodeURIComponent(value)}&limit=${limit}`;
  const response = await fetchJikan<{ data?: RawJikanAnime[] }>(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] as JikanAnime[] };
  }

  return {
    found: true,
    count: response.data.length,
    results: response.data.map(normalizeAnime).filter(Boolean) as JikanAnime[],
  };
}

/**
 * Get top ranking anime
 */
export async function getTopAnime(limit: number = 10) {
  const endpoint = `/top/anime?limit=${limit}`;
  const response = await fetchJikan<{ data?: RawJikanAnime[] }>(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] as JikanAnime[] };
  }

  return {
    found: true,
    count: response.data.length,
    results: response.data.map(normalizeAnime).filter(Boolean) as JikanAnime[],
  };
}

/**
 * Get current season anime
 */
export async function getCurrentSeasonAnime(limit: number = 10) {
  const endpoint = `/seasons/now?limit=${limit}`;
  const response = await fetchJikan<{ data?: RawJikanAnime[] }>(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] as JikanAnime[] };
  }

  return {
    found: true,
    count: response.data.length,
    results: response.data.map(normalizeAnime).filter(Boolean) as JikanAnime[],
  };
}

/**
 * Get specific anime details by ID
 */
export async function getAnimeDetails(id: string | number) {
  const endpoint = `/anime/${encodeURIComponent(String(id))}/full`;
  const response = await fetchJikan<{ data?: RawJikanAnime }>(endpoint);

  if (!response || !response.data) {
    return { found: false, anime: null as JikanAnime | null };
  }

  return {
    found: true,
    anime: normalizeAnime(response.data),
  };
}

export async function getSeasonAnime(
  year: number | string,
  season: string,
  limit: number = 25,
) {
  const validSeasons = ["winter", "spring", "summer", "fall"];
  const normalizedSeason = season.toLowerCase();
  if (!validSeasons.includes(normalizedSeason)) {
    return {
      found: false,
      results: [] as JikanAnime[],
      error: `Invalid season '${season}'. Must be one of: ${validSeasons.join(", ")}`,
    };
  }

  const endpoint = `/seasons/${year}/${normalizedSeason}?limit=${limit}`;
  const response = await fetchJikan<{ data?: RawJikanAnime[] }>(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] as JikanAnime[] };
  }

  return {
    found: true,
    year: Number(year),
    season: normalizedSeason,
    count: response.data.length,
    results: response.data.map(normalizeAnime).filter(Boolean) as JikanAnime[],
  };
}

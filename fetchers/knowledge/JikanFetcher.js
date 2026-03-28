import { JIKAN_BASE_URL } from "../../constants.js";

/**
 * Jikan API Fetcher (MyAnimeList unofficial API v4)
 * https://docs.api.jikan.moe/
 */

// ─── Helpers ───────────────────────────────────────────────────────

function normalizeAnime(anime) {
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
    themes: (anime.themes || []).map((t) => t.name),
  };
}

/**
 * Handle Jikan API rate limiting via delays and standard fetch wrapper.
 */
async function fetchJikan(endpoint) {
  const url = `${JIKAN_BASE_URL}${endpoint}`;
  const res = await fetch(url);

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Jikan API → ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data;
}

// ─── Fetchers ──────────────────────────────────────────────────────

/**
 * Search anime by title
 * @param {string} q
 * @param {number} limit
 * @returns {Promise<object>}
 */
export async function searchAnime(q, limit = 10) {
  const endpoint = `/anime?q=${encodeURIComponent(q)}&limit=${limit}`;
  const response = await fetchJikan(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] };
  }

  return {
    found: true,
    count: response.data.length,
    results: response.data.map(normalizeAnime),
  };
}

/**
 * Get top ranking anime
 * @param {number} limit
 * @returns {Promise<object>}
 */
export async function getTopAnime(limit = 10) {
  const endpoint = `/top/anime?limit=${limit}`;
  const response = await fetchJikan(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] };
  }

  return {
    found: true,
    count: response.data.length,
    results: response.data.map(normalizeAnime),
  };
}

/**
 * Get current season anime
 * @param {number} limit
 * @returns {Promise<object>}
 */
export async function getCurrentSeasonAnime(limit = 10) {
  const endpoint = `/seasons/now?limit=${limit}`;
  const response = await fetchJikan(endpoint);

  if (!response || !response.data) {
    return { found: false, results: [] };
  }

  return {
    found: true,
    count: response.data.length,
    results: response.data.map(normalizeAnime),
  };
}

/**
 * Get specific anime details by ID
 * @param {string|number} id
 * @returns {Promise<object>}
 */
export async function getAnimeDetails(id) {
  const endpoint = `/anime/${encodeURIComponent(id)}/full`;
  const response = await fetchJikan(endpoint);

  if (!response || !response.data) {
    return { found: false, anime: null };
  }

  return {
    found: true,
    anime: normalizeAnime(response.data),
  };
}

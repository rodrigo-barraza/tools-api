import CONFIG from "../../config.js";
import { TMDB_BASE_URL, TMDB_IMAGE_BASE_URL } from "../../constants.js";

/**
 * TMDb Fetcher — Movies & TV Series
 * https://developer.themoviedb.org/reference
 *
 * Uses the existing TMDB_API_KEY (already in secrets/config).
 * All endpoints are on-demand (no background polling).
 */

// ─── Helpers ───────────────────────────────────────────────────────

function img(path, size = "w500") {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : null;
}

async function fetchTMDb(endpoint) {
  if (!CONFIG.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE_URL}${endpoint}${separator}api_key=${CONFIG.TMDB_API_KEY}`;
  const res = await fetch(url);

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`TMDb API → ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Normalizers ───────────────────────────────────────────────────

function normalizeMovie(m) {
  if (!m) return null;
  return {
    tmdbId: m.id,
    title: m.title || null,
    originalTitle: m.original_title || null,
    tagline: m.tagline || null,
    overview: m.overview ? m.overview.substring(0, 1500) : null,
    releaseDate: m.release_date || null,
    status: m.status || null,
    runtime: m.runtime || null,
    budget: m.budget || null,
    revenue: m.revenue || null,
    voteAverage: m.vote_average || null,
    voteCount: m.vote_count || null,
    popularity: m.popularity || null,
    posterUrl: img(m.poster_path),
    backdropUrl: img(m.backdrop_path, "w1280"),
    genres: (m.genres || m.genre_ids || []).map((g) =>
      typeof g === "object" ? g.name : g,
    ),
    originalLanguage: m.original_language || null,
    spokenLanguages: (m.spoken_languages || []).map(
      (l) => l.english_name || l.name,
    ),
    productionCompanies: (m.production_companies || []).map((c) => c.name),
    productionCountries: (m.production_countries || []).map(
      (c) => c.name || c.iso_3166_1,
    ),
    homepage: m.homepage || null,
    imdbId: m.imdb_id || null,
    url: `https://www.themoviedb.org/movie/${m.id}`,
  };
}

function normalizeTvShow(tv) {
  if (!tv) return null;
  return {
    tmdbId: tv.id,
    name: tv.name || null,
    originalName: tv.original_name || null,
    tagline: tv.tagline || null,
    overview: tv.overview ? tv.overview.substring(0, 1500) : null,
    firstAirDate: tv.first_air_date || null,
    lastAirDate: tv.last_air_date || null,
    status: tv.status || null,
    type: tv.type || null,
    numberOfSeasons: tv.number_of_seasons || null,
    numberOfEpisodes: tv.number_of_episodes || null,
    episodeRuntime: tv.episode_run_time?.[0] || null,
    voteAverage: tv.vote_average || null,
    voteCount: tv.vote_count || null,
    popularity: tv.popularity || null,
    posterUrl: img(tv.poster_path),
    backdropUrl: img(tv.backdrop_path, "w1280"),
    genres: (tv.genres || tv.genre_ids || []).map((g) =>
      typeof g === "object" ? g.name : g,
    ),
    networks: (tv.networks || []).map((n) => n.name),
    productionCompanies: (tv.production_companies || []).map((c) => c.name),
    createdBy: (tv.created_by || []).map((c) => c.name),
    originCountry: tv.origin_country || [],
    originalLanguage: tv.original_language || null,
    homepage: tv.homepage || null,
    inProduction: tv.in_production || false,
    url: `https://www.themoviedb.org/tv/${tv.id}`,
  };
}

function normalizeCast(person) {
  return {
    tmdbId: person.id,
    name: person.name,
    character: person.character || person.roles?.[0]?.character || null,
    profileUrl: img(person.profile_path, "w185"),
    order: person.order ?? null,
    knownForDepartment: person.known_for_department || null,
  };
}

function normalizeCrew(person) {
  return {
    tmdbId: person.id,
    name: person.name,
    job: person.job || person.jobs?.[0]?.job || null,
    department: person.department || null,
    profileUrl: img(person.profile_path, "w185"),
  };
}

// ─── Movie Fetchers ────────────────────────────────────────────────

/**
 * Search movies by title
 */
export async function searchMovies(query, { page = 1, year } = {}) {
  let endpoint = `/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=en-US`;
  if (year) endpoint += `&year=${year}`;

  const data = await fetchTMDb(endpoint);
  if (!data || !data.results) {
    return { found: false, results: [], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.map(normalizeMovie),
  };
}

/**
 * Get full movie details by TMDb ID
 */
export async function getMovieDetails(id) {
  const data = await fetchTMDb(`/movie/${id}?language=en-US`);
  if (!data) return { found: false, movie: null };

  return { found: true, movie: normalizeMovie(data) };
}

/**
 * Get movie credits (cast + crew)
 */
export async function getMovieCredits(id) {
  const data = await fetchTMDb(`/movie/${id}/credits?language=en-US`);
  if (!data) return { found: false, cast: [], crew: [] };

  return {
    found: true,
    cast: (data.cast || []).slice(0, 20).map(normalizeCast),
    crew: (data.crew || [])
      .filter((c) =>
        ["Director", "Writer", "Screenplay", "Producer", "Director of Photography", "Original Music Composer"].includes(c.job),
      )
      .map(normalizeCrew),
  };
}

/**
 * Get trending movies (day or week)
 */
export async function getTrendingMovies(timeWindow = "day", limit = 10) {
  const data = await fetchTMDb(`/trending/movie/${timeWindow}?language=en-US`);
  if (!data || !data.results) return { found: false, results: [] };

  return {
    found: true,
    timeWindow,
    count: Math.min(data.results.length, limit),
    results: data.results.slice(0, limit).map(normalizeMovie),
  };
}

/**
 * Discover movies with filtering (genre, year, sort)
 */
export async function discoverMovies({
  genreId,
  year,
  sortBy = "popularity.desc",
  page = 1,
  minVoteAverage,
  minVoteCount,
} = {}) {
  let endpoint = `/discover/movie?language=en-US&sort_by=${sortBy}&page=${page}`;
  if (genreId) endpoint += `&with_genres=${genreId}`;
  if (year) endpoint += `&primary_release_year=${year}`;
  if (minVoteAverage) endpoint += `&vote_average.gte=${minVoteAverage}`;
  if (minVoteCount) endpoint += `&vote_count.gte=${minVoteCount}`;

  const data = await fetchTMDb(endpoint);
  if (!data || !data.results) {
    return { found: false, results: [], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.map(normalizeMovie),
  };
}

// ─── TV Series Fetchers ────────────────────────────────────────────

/**
 * Search TV series by name
 */
export async function searchTvShows(query, { page = 1, firstAirDateYear } = {}) {
  let endpoint = `/search/tv?query=${encodeURIComponent(query)}&page=${page}&language=en-US`;
  if (firstAirDateYear) endpoint += `&first_air_date_year=${firstAirDateYear}`;

  const data = await fetchTMDb(endpoint);
  if (!data || !data.results) {
    return { found: false, results: [], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.map(normalizeTvShow),
  };
}

/**
 * Get full TV series details by TMDb ID
 */
export async function getTvShowDetails(id) {
  const data = await fetchTMDb(`/tv/${id}?language=en-US`);
  if (!data) return { found: false, tvShow: null };

  return { found: true, tvShow: normalizeTvShow(data) };
}

/**
 * Get TV series aggregate credits (cast + crew across all seasons)
 */
export async function getTvShowCredits(id) {
  const data = await fetchTMDb(`/tv/${id}/aggregate_credits?language=en-US`);
  if (!data) return { found: false, cast: [], crew: [] };

  return {
    found: true,
    cast: (data.cast || []).slice(0, 20).map(normalizeCast),
    crew: (data.crew || [])
      .filter((c) => {
        const job = c.jobs?.[0]?.job || c.job || "";
        return ["Creator", "Director", "Executive Producer", "Writer", "Showrunner"].includes(job);
      })
      .map(normalizeCrew),
  };
}

/**
 * Get TV season details
 */
export async function getTvSeasonDetails(tvId, seasonNumber) {
  const data = await fetchTMDb(`/tv/${tvId}/season/${seasonNumber}?language=en-US`);
  if (!data) return { found: false, season: null };

  return {
    found: true,
    season: {
      seasonNumber: data.season_number,
      name: data.name || null,
      overview: data.overview || null,
      airDate: data.air_date || null,
      posterUrl: img(data.poster_path),
      episodeCount: (data.episodes || []).length,
      episodes: (data.episodes || []).map((ep) => ({
        episodeNumber: ep.episode_number,
        name: ep.name,
        overview: ep.overview ? ep.overview.substring(0, 500) : null,
        airDate: ep.air_date || null,
        runtime: ep.runtime || null,
        voteAverage: ep.vote_average || null,
        stillUrl: img(ep.still_path),
      })),
    },
  };
}

/**
 * Get trending TV shows (day or week)
 */
export async function getTrendingTvShows(timeWindow = "day", limit = 10) {
  const data = await fetchTMDb(`/trending/tv/${timeWindow}?language=en-US`);
  if (!data || !data.results) return { found: false, results: [] };

  return {
    found: true,
    timeWindow,
    count: Math.min(data.results.length, limit),
    results: data.results.slice(0, limit).map(normalizeTvShow),
  };
}

/**
 * Discover TV series with filtering
 */
export async function discoverTvShows({
  genreId,
  firstAirDateYear,
  sortBy = "popularity.desc",
  page = 1,
  minVoteAverage,
  minVoteCount,
} = {}) {
  let endpoint = `/discover/tv?language=en-US&sort_by=${sortBy}&page=${page}`;
  if (genreId) endpoint += `&with_genres=${genreId}`;
  if (firstAirDateYear) endpoint += `&first_air_date_year=${firstAirDateYear}`;
  if (minVoteAverage) endpoint += `&vote_average.gte=${minVoteAverage}`;
  if (minVoteCount) endpoint += `&vote_count.gte=${minVoteCount}`;

  const data = await fetchTMDb(endpoint);
  if (!data || !data.results) {
    return { found: false, results: [], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.map(normalizeTvShow),
  };
}

// ─── Genre Lists ───────────────────────────────────────────────────

/**
 * Get movie genre list (useful for discover filters)
 */
export async function getMovieGenres() {
  const data = await fetchTMDb("/genre/movie/list?language=en-US");
  if (!data || !data.genres) return { found: false, genres: [] };
  return { found: true, genres: data.genres };
}

/**
 * Get TV genre list
 */
export async function getTvGenres() {
  const data = await fetchTMDb("/genre/tv/list?language=en-US");
  if (!data || !data.genres) return { found: false, genres: [] };
  return { found: true, genres: data.genres };
}

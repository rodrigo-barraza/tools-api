import CONFIG from "../../config.ts";
import { TMDB_BASE_URL, TMDB_IMAGE_BASE_URL } from "../../constants.ts";
import {
  type MovieResult,
  type TvShowResult,
  type CastMember,
  type CrewMember,
  type TvSeason,
  type PersonResult,
  type PersonCreditEntry,
  type WatchProviderEntry,
  type WatchProviderResult,
} from "../../types/knowledge.ts";

/**
 * TMDb Fetcher — Movies & TV Series
 * https://developer.themoviedatabase.org/reference
 *
 * Uses the existing TMDB_API_KEY (already in secrets/config).
 * All endpoints are on-demand (no background polling).
 */

// ─── Interfaces ───────────────────────────────────────────────────

interface RawTmdbMovie {
  id: number;
  title?: string | null;
  original_title?: string | null;
  tagline?: string | null;
  overview?: string | null;
  release_date?: string | null;
  status?: string | null;
  runtime?: number | null;
  budget?: number | null;
  revenue?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
  popularity?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
  original_language?: string | null;
  spoken_languages?: Array<{ english_name?: string; name?: string }>;
  production_companies?: Array<{ name: string }>;
  production_countries?: Array<{ name?: string; iso_3166_1?: string }>;
  homepage?: string | null;
  imdb_id?: string | null;
}

interface RawTmdbTvShow {
  id: number;
  name?: string | null;
  original_name?: string | null;
  tagline?: string | null;
  overview?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  status?: string | null;
  type?: string | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  episode_run_time?: number[] | null;
  vote_average?: number | null;
  vote_count?: number | null;
  popularity?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
  networks?: Array<{ name: string }>;
  production_companies?: Array<{ name: string }>;
  created_by?: Array<{ name: string }>;
  origin_country?: string[];
  original_language?: string | null;
  homepage?: string | null;
  in_production?: boolean;
}

interface RawTmdbCast {
  id: number;
  name: string;
  character?: string | null;
  roles?: Array<{ character: string }>;
  profile_path?: string | null;
  order?: number | null;
  known_for_department?: string | null;
}

interface RawTmdbCrew {
  id: number;
  name: string;
  job?: string | null;
  jobs?: Array<{ job: string }>;
  department?: string | null;
  profile_path?: string | null;
}

interface RawTmdbPerson {
  id: number;
  name?: string | null;
  known_for_department?: string | null;
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  gender?: number | null;
  popularity?: number | null;
  profile_path?: string | null;
  imdb_id?: string | null;
  homepage?: string | null;
  also_known_as?: string[];
}

interface RawTmdbCombinedCredit {
  id: number;
  media_type: string;
  title?: string | null;
  name?: string | null;
  character?: string | null;
  job?: string | null;
  department?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  poster_path?: string | null;
}

interface RawTmdbWatchProvider {
  provider_name: string;
  logo_path?: string | null;
  display_priority: number;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

interface RawTmdbEpisode {
  episode_number: number;
  name: string;
  overview?: string | null;
  air_date?: string | null;
  runtime?: number | null;
  vote_average?: number | null;
  still_path?: string | null;
}

interface RawTmdbSeason {
  season_number: number;
  name?: string | null;
  overview?: string | null;
  air_date?: string | null;
  poster_path?: string | null;
  episodes?: RawTmdbEpisode[];
}

// ─── Helpers ───────────────────────────────────────────────────────

function img(
  path: string | null | undefined,
  size: string = "w500",
): string | null {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : null;
}

async function fetchTMDb<T>(endpoint: string): Promise<T | null> {
  if (!CONFIG.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE_URL}${endpoint}${separator}api_key=${CONFIG.TMDB_API_KEY}`;
  const response = await fetch(url);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`TMDb API → ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// ─── Normalizers ───────────────────────────────────────────────────

function normalizeMovie(
  message: RawTmdbMovie | null | undefined,
): MovieResult | null {
  if (!message) return null;
  return {
    tmdbId: message.id,
    title: message.title || null,
    originalTitle: message.original_title || null,
    tagline: message.tagline || null,
    overview: message.overview ? message.overview.substring(0, 1500) : null,
    releaseDate: message.release_date || null,
    status: message.status || null,
    runtime: message.runtime || null,
    budget: message.budget || null,
    revenue: message.revenue || null,
    voteAverage: message.vote_average || null,
    voteCount: message.vote_count || null,
    popularity: message.popularity || null,
    posterUrl: img(message.poster_path),
    backdropUrl: img(message.backdrop_path, "w1280"),
    genres: (message.genres || [])
      .map((g) => g.name)
      .concat((message.genre_ids || []).map((id) => String(id))),
    originalLanguage: message.original_language || null,
    spokenLanguages: (message.spoken_languages || [])
      .map((l) => l.english_name || l.name || "")
      .filter(Boolean),
    productionCompanies: (message.production_companies || []).map(
      (company) => company.name,
    ),
    productionCountries: (message.production_countries || [])
      .map((country) => country.name || country.iso_3166_1 || "")
      .filter(Boolean),
    homepage: message.homepage || null,
    imdbId: message.imdb_id || null,
    url: `https://www.themoviedatabase.org/movie/${message.id}`,
  };
}

function normalizeTvShow(
  tv: RawTmdbTvShow | null | undefined,
): TvShowResult | null {
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
    genres: (tv.genres || [])
      .map((genre) => genre.name)
      .concat((tv.genre_ids || []).map((id) => String(id))),
    networks: (tv.networks || []).map((network) => network.name),
    productionCompanies: (tv.production_companies || []).map((company) => company.name),
    createdBy: (tv.created_by || []).map((creator) => creator.name),
    originCountry: tv.origin_country || [],
    originalLanguage: tv.original_language || null,
    homepage: tv.homepage || null,
    inProduction: tv.in_production || false,
    url: `https://www.themoviedatabase.org/tv/${tv.id}`,
  };
}

function normalizeCast(person: RawTmdbCast): CastMember {
  return {
    tmdbId: person.id,
    name: person.name,
    character: person.character || person.roles?.[0]?.character || null,
    profileUrl: img(person.profile_path, "w185"),
    order: person.order ?? null,
    knownForDepartment: person.known_for_department || null,
  };
}

function normalizeCrew(person: RawTmdbCrew): CrewMember {
  return {
    tmdbId: person.id,
    name: person.name,
    job: person.job || person.jobs?.[0]?.job || null,
    department: person.department || null,
    profileUrl: img(person.profile_path, "w185"),
  };
}

// ─── Movie Fetchers ────────────────────────────────────────────────

export interface SearchMoviesOptions {
  page?: number;
  year?: number;
}

/**
 * Search movies by title
 */
export async function searchMovies(
  query: string,
  { page = 1, year }: SearchMoviesOptions = {},
) {
  let endpoint = `/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=en-US`;
  if (year) endpoint += `&year=${year}`;

  const data = await fetchTMDb<{
    results?: RawTmdbMovie[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(endpoint);

  if (!data || !data.results) {
    return {
      found: false,
      results: [] as MovieResult[],
      totalResults: 0,
      page: 1,
      totalPages: 0,
    };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.map(normalizeMovie).filter(Boolean) as MovieResult[],
  };
}

/**
 * Get full movie details by TMDb ID
 */
export async function getMovieDetails(id: string | number) {
  const data = await fetchTMDb<RawTmdbMovie>(`/movie/${id}?language=en-US`);
  if (!data) return { found: false, movie: null };

  return { found: true, movie: normalizeMovie(data) };
}

/**
 * Get movie credits (cast + crew)
 */
export async function getMovieCredits(id: string | number) {
  const data = await fetchTMDb<{
    cast?: RawTmdbCast[];
    crew?: RawTmdbCrew[];
  }>(`/movie/${id}/credits?language=en-US`);

  if (!data)
    return { found: false, cast: [] as CastMember[], crew: [] as CrewMember[] };

  return {
    found: true,
    cast: (data.cast || []).slice(0, 20).map(normalizeCast),
    crew: (data.crew || [])
      .filter((item) =>
        [
          "Director",
          "Writer",
          "Screenplay",
          "Producer",
          "Director of Photography",
          "Original Music Composer",
        ].includes(item.job || ""),
      )
      .map(normalizeCrew),
  };
}

/**
 * Get trending movies (day or week)
 */
export async function getTrendingMovies(
  timeWindow: string = "day",
  limit: number = 10,
) {
  const data = await fetchTMDb<{ results?: RawTmdbMovie[] }>(
    `/trending/movie/${timeWindow}?language=en-US`,
  );
  if (!data || !data.results)
    return { found: false, results: [] as MovieResult[] };

  return {
    found: true,
    timeWindow,
    count: Math.min(data.results.length, limit),
    results: data.results
      .slice(0, limit)
      .map(normalizeMovie)
      .filter(Boolean) as MovieResult[],
  };
}

export interface DiscoverMoviesOptions {
  genreId?: number | string;
  year?: number | string;
  sortBy?: string;
  page?: number;
  minVoteAverage?: number | string;
  minVoteCount?: number | string;
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
}: DiscoverMoviesOptions = {}) {
  let endpoint = `/discover/movie?language=en-US&sort_by=${sortBy}&page=${page}`;
  if (genreId) endpoint += `&with_genres=${genreId}`;
  if (year) endpoint += `&primary_release_year=${year}`;
  if (minVoteAverage) endpoint += `&vote_average.gte=${minVoteAverage}`;
  if (minVoteCount) endpoint += `&vote_count.gte=${minVoteCount}`;

  const data = await fetchTMDb<{
    results?: RawTmdbMovie[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(endpoint);

  if (!data || !data.results) {
    return {
      found: false,
      results: [] as MovieResult[],
      totalResults: 0,
      page: 1,
      totalPages: 0,
    };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.map(normalizeMovie).filter(Boolean) as MovieResult[],
  };
}

// ─── TV Series Fetchers ────────────────────────────────────────────

export interface SearchTvShowsOptions {
  page?: number;
  firstAirDateYear?: number | string;
}

/**
 * Search TV series by name
 */
export async function searchTvShows(
  query: string,
  { page = 1, firstAirDateYear }: SearchTvShowsOptions = {},
) {
  let endpoint = `/search/tv?query=${encodeURIComponent(query)}&page=${page}&language=en-US`;
  if (firstAirDateYear) endpoint += `&first_air_date_year=${firstAirDateYear}`;

  const data = await fetchTMDb<{
    results?: RawTmdbTvShow[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(endpoint);

  if (!data || !data.results) {
    return {
      found: false,
      results: [] as TvShowResult[],
      totalResults: 0,
      page: 1,
      totalPages: 0,
    };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results
      .map(normalizeTvShow)
      .filter(Boolean) as TvShowResult[],
  };
}

/**
 * Get full TV series details by TMDb ID
 */
export async function getTvShowDetails(id: string | number) {
  const data = await fetchTMDb<RawTmdbTvShow>(`/tv/${id}?language=en-US`);
  if (!data) return { found: false, tvShow: null };

  return { found: true, tvShow: normalizeTvShow(data) };
}

/**
 * Get TV series aggregate credits (cast + crew across all seasons)
 */
export async function getTvShowCredits(id: string | number) {
  const data = await fetchTMDb<{
    cast?: RawTmdbCast[];
    crew?: RawTmdbCrew[];
  }>(`/tv/${id}/aggregate_credits?language=en-US`);

  if (!data)
    return { found: false, cast: [] as CastMember[], crew: [] as CrewMember[] };

  return {
    found: true,
    cast: (data.cast || []).slice(0, 20).map(normalizeCast),
    crew: (data.crew || [])
      .filter((item) => {
        const job = item.jobs?.[0]?.job || item.job || "";
        return [
          "Creator",
          "Director",
          "Executive Producer",
          "Writer",
          "Showrunner",
        ].includes(job);
      })
      .map(normalizeCrew),
  };
}

/**
 * Get TV season details
 */
export async function getTvSeasonDetails(
  tvId: string | number,
  seasonNumber: string | number,
) {
  const data = await fetchTMDb<RawTmdbSeason>(
    `/tv/${tvId}/season/${seasonNumber}?language=en-US`,
  );
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
    } as TvSeason,
  };
}

/**
 * Get trending TV shows (day or week)
 */
export async function getTrendingTvShows(
  timeWindow: string = "day",
  limit: number = 10,
) {
  const data = await fetchTMDb<{ results?: RawTmdbTvShow[] }>(
    `/trending/tv/${timeWindow}?language=en-US`,
  );
  if (!data || !data.results)
    return { found: false, results: [] as TvShowResult[] };

  return {
    found: true,
    timeWindow,
    count: Math.min(data.results.length, limit),
    results: data.results
      .slice(0, limit)
      .map(normalizeTvShow)
      .filter(Boolean) as TvShowResult[],
  };
}

export interface DiscoverTvShowsOptions {
  genreId?: number | string;
  firstAirDateYear?: number | string;
  sortBy?: string;
  page?: number;
  minVoteAverage?: number | string;
  minVoteCount?: number | string;
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
}: DiscoverTvShowsOptions = {}) {
  let endpoint = `/discover/tv?language=en-US&sort_by=${sortBy}&page=${page}`;
  if (genreId) endpoint += `&with_genres=${genreId}`;
  if (firstAirDateYear) endpoint += `&first_air_date_year=${firstAirDateYear}`;
  if (minVoteAverage) endpoint += `&vote_average.gte=${minVoteAverage}`;
  if (minVoteCount) endpoint += `&vote_count.gte=${minVoteCount}`;

  const data = await fetchTMDb<{
    results?: RawTmdbTvShow[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(endpoint);

  if (!data || !data.results) {
    return {
      found: false,
      results: [] as TvShowResult[],
      totalResults: 0,
      page: 1,
      totalPages: 0,
    };
  }

  return {
    found: true,
    count: data.results.length,
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results
      .map(normalizeTvShow)
      .filter(Boolean) as TvShowResult[],
  };
}

// ─── Genre Lists ───────────────────────────────────────────────────

/**
 * Get movie genre list (useful for discover filters)
 */
export async function getMovieGenres() {
  const data = await fetchTMDb<{ genres: TmdbGenre[] }>(
    "/genre/movie/list?language=en-US",
  );
  if (!data || !data.genres) return { found: false, genres: [] as TmdbGenre[] };
  return { found: true, genres: data.genres };
}

/**
 * Get TV genre list
 */
export async function getTvGenres() {
  const data = await fetchTMDb<{ genres: TmdbGenre[] }>(
    "/genre/tv/list?language=en-US",
  );
  if (!data || !data.genres) return { found: false, genres: [] as TmdbGenre[] };
  return { found: true, genres: data.genres };
}

// ─── Now Playing / Upcoming / Airing ─────────────────────────────

export async function getNowPlayingMovies(
  region: string = "US",
  page: number = 1,
  limit: number = 20,
) {
  const data = await fetchTMDb<{
    results?: RawTmdbMovie[];
    total_results: number;
    page: number;
    total_pages: number;
    dates?: { maximum: string; minimum: string };
  }>(`/movie/now_playing?language=en-US&region=${region}&page=${page}`);

  if (!data || !data.results) {
    return { found: false, results: [] as MovieResult[], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: Math.min(data.results.length, limit),
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    dateRange: data.dates || null,
    results: data.results.slice(0, limit).map(normalizeMovie).filter(Boolean) as MovieResult[],
  };
}

export async function getUpcomingMovies(
  region: string = "US",
  page: number = 1,
  limit: number = 20,
) {
  const data = await fetchTMDb<{
    results?: RawTmdbMovie[];
    total_results: number;
    page: number;
    total_pages: number;
    dates?: { maximum: string; minimum: string };
  }>(`/movie/upcoming?language=en-US&region=${region}&page=${page}`);

  if (!data || !data.results) {
    return { found: false, results: [] as MovieResult[], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: Math.min(data.results.length, limit),
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    dateRange: data.dates || null,
    results: data.results.slice(0, limit).map(normalizeMovie).filter(Boolean) as MovieResult[],
  };
}

export async function getAiringTodayTvShows(
  page: number = 1,
  limit: number = 20,
) {
  const data = await fetchTMDb<{
    results?: RawTmdbTvShow[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(`/tv/airing_today?language=en-US&page=${page}`);

  if (!data || !data.results) {
    return { found: false, results: [] as TvShowResult[], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: Math.min(data.results.length, limit),
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.slice(0, limit).map(normalizeTvShow).filter(Boolean) as TvShowResult[],
  };
}

export async function getOnTheAirTvShows(
  page: number = 1,
  limit: number = 20,
) {
  const data = await fetchTMDb<{
    results?: RawTmdbTvShow[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(`/tv/on_the_air?language=en-US&page=${page}`);

  if (!data || !data.results) {
    return { found: false, results: [] as TvShowResult[], totalResults: 0, page: 1, totalPages: 0 };
  }

  return {
    found: true,
    count: Math.min(data.results.length, limit),
    totalResults: data.total_results,
    page: data.page,
    totalPages: data.total_pages,
    results: data.results.slice(0, limit).map(normalizeTvShow).filter(Boolean) as TvShowResult[],
  };
}

// ─── Recommendations & Similar ───────────────────────────────────

export async function getMediaRecommendations(
  type: "movie" | "tv",
  id: string | number,
  limit: number = 10,
) {
  const data = await fetchTMDb<{ results?: (RawTmdbMovie | RawTmdbTvShow)[] }>(
    `/${type}/${id}/recommendations?language=en-US`,
  );

  if (!data || !data.results) {
    return { found: false, results: [] as (MovieResult | TvShowResult)[] };
  }

  const normalizer = (item: RawTmdbMovie | RawTmdbTvShow): MovieResult | TvShowResult | null =>
    type === "movie" ? normalizeMovie(item as RawTmdbMovie) : normalizeTvShow(item as RawTmdbTvShow);

  return {
    found: true,
    type,
    count: Math.min(data.results.length, limit),
    results: data.results.slice(0, limit).map(normalizer).filter(Boolean) as (MovieResult | TvShowResult)[],
  };
}

export async function getMediaSimilar(
  type: "movie" | "tv",
  id: string | number,
  limit: number = 10,
) {
  const data = await fetchTMDb<{ results?: (RawTmdbMovie | RawTmdbTvShow)[] }>(
    `/${type}/${id}/similar?language=en-US`,
  );

  if (!data || !data.results) {
    return { found: false, results: [] as (MovieResult | TvShowResult)[] };
  }

  const normalizer = (item: RawTmdbMovie | RawTmdbTvShow): MovieResult | TvShowResult | null =>
    type === "movie" ? normalizeMovie(item as RawTmdbMovie) : normalizeTvShow(item as RawTmdbTvShow);

  return {
    found: true,
    type,
    count: Math.min(data.results.length, limit),
    results: data.results.slice(0, limit).map(normalizer).filter(Boolean) as (MovieResult | TvShowResult)[],
  };
}

// ─── Person / Actor Search ───────────────────────────────────────

const GENDER_MAP: Record<number, string> = {
  0: "Not specified",
  1: "Female",
  2: "Male",
  3: "Non-binary",
};

function normalizePerson(person: RawTmdbPerson | null | undefined): PersonResult | null {
  if (!person) return null;
  return {
    tmdbId: person.id,
    name: person.name || null,
    knownForDepartment: person.known_for_department || null,
    biography: person.biography ? person.biography.substring(0, 2000) : null,
    birthday: person.birthday || null,
    deathday: person.deathday || null,
    placeOfBirth: person.place_of_birth || null,
    gender: person.gender !== undefined && person.gender !== null ? (GENDER_MAP[person.gender] || null) : null,
    popularity: person.popularity || null,
    profileUrl: img(person.profile_path, "w500"),
    imdbId: person.imdb_id || null,
    homepage: person.homepage || null,
    alsoKnownAs: person.also_known_as || [],
    url: `https://www.themoviedatabase.org/person/${person.id}`,
  };
}

function normalizePersonCredit(credit: RawTmdbCombinedCredit): PersonCreditEntry {
  return {
    tmdbId: credit.id,
    mediaType: credit.media_type === "tv" ? "tv" : "movie",
    title: credit.title || credit.name || null,
    character: credit.character || null,
    job: credit.job || null,
    department: credit.department || null,
    releaseDate: credit.release_date || credit.first_air_date || null,
    voteAverage: credit.vote_average || null,
    posterUrl: img(credit.poster_path),
  };
}

export async function searchPeople(query: string, limit: number = 10) {
  const data = await fetchTMDb<{
    results?: RawTmdbPerson[];
    total_results: number;
    page: number;
    total_pages: number;
  }>(`/search/person?query=${encodeURIComponent(query)}&language=en-US`);

  if (!data || !data.results) {
    return { found: false, results: [] as PersonResult[], totalResults: 0 };
  }

  return {
    found: true,
    count: Math.min(data.results.length, limit),
    totalResults: data.total_results,
    results: data.results.slice(0, limit).map(normalizePerson).filter(Boolean) as PersonResult[],
  };
}

export async function getPersonDetails(id: string | number) {
  const data = await fetchTMDb<RawTmdbPerson>(`/person/${id}?language=en-US`);
  if (!data) return { found: false, person: null };

  return { found: true, person: normalizePerson(data) };
}

export async function getPersonCredits(id: string | number, limit: number = 30) {
  const data = await fetchTMDb<{
    cast?: RawTmdbCombinedCredit[];
    crew?: RawTmdbCombinedCredit[];
  }>(`/person/${id}/combined_credits?language=en-US`);

  if (!data) {
    return { found: false, cast: [] as PersonCreditEntry[], crew: [] as PersonCreditEntry[] };
  }

  const sortByDate = (personCreditEntry: PersonCreditEntry, b: PersonCreditEntry) => {
    const dateA = personCreditEntry.releaseDate || "";
    const dateB = b.releaseDate || "";
    return dateB.localeCompare(dateA);
  };

  return {
    found: true,
    cast: (data.cast || []).map(normalizePersonCredit).sort(sortByDate).slice(0, limit),
    crew: (data.crew || [])
      .filter((credit) => ["Director", "Writer", "Producer", "Executive Producer", "Creator", "Screenplay"].includes(credit.job || ""))
      .map(normalizePersonCredit)
      .sort(sortByDate)
      .slice(0, limit),
  };
}

// ─── Watch Providers ─────────────────────────────────────────────

function normalizeWatchProvider(provider: RawTmdbWatchProvider): WatchProviderEntry {
  return {
    providerName: provider.provider_name,
    providerLogoUrl: img(provider.logo_path, "w92"),
    displayPriority: provider.display_priority,
  };
}

export async function getWatchProviders(
  type: "movie" | "tv",
  id: string | number,
  region: string = "US",
) {
  const data = await fetchTMDb<{
    results?: Record<string, {
      link?: string;
      flatrate?: RawTmdbWatchProvider[];
      rent?: RawTmdbWatchProvider[];
      buy?: RawTmdbWatchProvider[];
      free?: RawTmdbWatchProvider[];
    }>;
  }>(`/${type}/${id}/watch/providers`);

  if (!data || !data.results) {
    return { found: false, providers: null };
  }

  const regionData = data.results[region] || data.results["US"];
  if (!regionData) {
    const availableRegions = Object.keys(data.results).sort();
    return {
      found: false,
      providers: null,
      availableRegions,
      message: `No providers found for region '${region}'. Available: ${availableRegions.join(", ")}`,
    };
  }

  const result: WatchProviderResult = {
    tmdbId: typeof id === "string" ? parseInt(id, 10) : id,
    title: null,
    region,
    link: regionData.link || null,
    flatrate: (regionData.flatrate || []).map(normalizeWatchProvider),
    rent: (regionData.rent || []).map(normalizeWatchProvider),
    buy: (regionData.buy || []).map(normalizeWatchProvider),
    free: (regionData.free || []).map(normalizeWatchProvider),
  };

  return { found: true, providers: result };
}


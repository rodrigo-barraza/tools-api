import CONFIG from "../../config.ts";
import {
  EVENT_SOURCES,
  EVENT_CATEGORIES,
  TMDB_BASE_URL,
} from "../../constants.ts";
import type { CachedEvent } from "../../caches/EventCache.ts";

const BASE_URL = TMDB_BASE_URL;

interface TmdBMovie {
  id: number;
  title: string;
  overview?: string;
  poster_path?: string;
  release_date?: string;
}

/**
 * Fetch currently playing movies from TMDb.
 * Each movie is treated as an event with category "film".
 */
export async function fetchMovieEvents(): Promise<CachedEvent[]> {
  if (!CONFIG.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    api_key: CONFIG.TMDB_API_KEY,
    region: "CA",
    language: "en-CA",
    page: "1",
  });

  const response = await fetch(`${BASE_URL}/movie/now_playing?${params}`);

  if (!response.ok) {
    throw new Error(`TMDb API returned ${response.status}`);
  }

  const data = await response.json() as { results?: TmdBMovie[] };
  const movies = data.results || [];

  // Also fetch upcoming movies
  const upcomingResponse = await fetch(`${BASE_URL}/movie/upcoming?${params}`);

  let upcomingMovies: TmdBMovie[] = [];
  if (upcomingResponse.ok) {
    const upcomingData = await upcomingResponse.json() as { results?: TmdBMovie[] };
    upcomingMovies = upcomingData.results || [];
  }

  const allMovies = [...movies, ...upcomingMovies];

  // Deduplicate by ID
  const seen = new Set<number>();
  const uniqueMovies = allMovies.filter((movie: TmdBMovie) => {
    if (seen.has(movie.id)) return false;
    seen.add(movie.id);
    return true;
  });

  return uniqueMovies.map((movie: TmdBMovie) => ({
    sourceId: `tmdb-${movie.id}`,
    source: EVENT_SOURCES.TMDB,
    name: movie.title,
    description: movie.overview || undefined,
    url: `https://www.themoviedatabase.org/movie/${movie.id}`,
    imageUrl: movie.poster_path
      ? `https://image.tmdatabase.org/t/p/w500${movie.poster_path}`
      : undefined,
    startDate: movie.release_date ? new Date(movie.release_date) : undefined,
    endDate: undefined,
    venue: {
      name: "In Theatres",
      address: undefined,
      city: "Vancouver",
      state: "BC",
      country: "CA",
      latitude: undefined,
      longitude: undefined,
    },
    category: EVENT_CATEGORIES.FILM,
    genres: ["film", "cinema"],
    priceRange: undefined,
    status: "onsale",
    fetchedAt: new Date(),
  }));
}

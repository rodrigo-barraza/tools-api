import CONFIG from "../../config.js";
import {
  EVENT_SOURCES,
  EVENT_CATEGORIES,
  TMDB_BASE_URL,
} from "../../constants.js";

const BASE_URL = TMDB_BASE_URL;

/**
 * Fetch currently playing movies from TMDb.
 * Each movie is treated as an event with category "film".
 */
export async function fetchMovieEvents() {
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

  const data = await response.json();
  const movies = data.results || [];

  // Also fetch upcoming movies
  const upcomingResponse = await fetch(`${BASE_URL}/movie/upcoming?${params}`);

  let upcomingMovies = [];
  if (upcomingResponse.ok) {
    const upcomingData = await upcomingResponse.json();
    upcomingMovies = upcomingData.results || [];
  }

  const allMovies = [...movies, ...upcomingMovies];

  // Deduplicate by ID
  const seen = new Set();
  const uniqueMovies = allMovies.filter((movie) => {
    if (seen.has(movie.id)) return false;
    seen.add(movie.id);
    return true;
  });

  return uniqueMovies.map((movie) => ({
    sourceId: `tmdb-${movie.id}`,
    source: EVENT_SOURCES.TMDB,
    name: movie.title,
    description: movie.overview || null,
    url: `https://www.themoviedb.org/movie/${movie.id}`,
    imageUrl: movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : null,
    startDate: movie.release_date ? new Date(movie.release_date) : null,
    endDate: null,
    venue: {
      name: "In Theatres",
      address: null,
      city: "Vancouver",
      state: "BC",
      country: "CA",
      latitude: null,
      longitude: null,
    },
    category: EVENT_CATEGORIES.FILM,
    genres: ["film", "cinema"],
    priceRange: null,
    status: "onsale",
    fetchedAt: new Date(),
  }));
}

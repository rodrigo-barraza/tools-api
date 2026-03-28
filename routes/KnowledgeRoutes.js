import { Router } from "express";
import { fetchDefinition } from "../fetchers/knowledge/DictionaryFetcher.js";
import {
  searchBooks,
  getBookDetails,
  getAuthorInfo,
} from "../fetchers/knowledge/OpenLibraryFetcher.js";
import {
  searchCountries,
  getCountryByCode,
} from "../fetchers/knowledge/RestCountriesFetcher.js";
import { searchPapers } from "../fetchers/knowledge/ArxivFetcher.js";
import {
  getArticleSummary,
  getOnThisDay,
} from "../fetchers/knowledge/WikipediaSummaryFetcher.js";
import {
  searchAnime,
  getTopAnime,
  getCurrentSeasonAnime,
  getAnimeDetails,
} from "../fetchers/knowledge/JikanFetcher.js";
import {
  searchMovies,
  getMovieDetails,
  getMovieCredits,
  getTrendingMovies,
  discoverMovies,
  getMovieGenres,
  searchTvShows,
  getTvShowDetails,
  getTvShowCredits,
  getTvSeasonDetails,
  getTrendingTvShows,
  discoverTvShows,
  getTvGenres,
} from "../fetchers/knowledge/TMDbFetcher.js";
import { parseIntParam } from "../utilities.js";

const router = Router();

// ─── Dictionary ────────────────────────────────────────────────────

router.get("/dictionary/:word", async (req, res) => {
  try {
    const result = await fetchDefinition(req.params.word);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Dictionary lookup failed: ${err.message}` });
  }
});

// ─── Books ─────────────────────────────────────────────────────────

router.get("/books/search", async (req, res) => {
  const { q, limit } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const result = await searchBooks(q, parseIntParam(limit, 10));
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Book search failed: ${err.message}` });
  }
});

router.get("/books/work/:workKey", async (req, res) => {
  try {
    const result = await getBookDetails(req.params.workKey);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Book details failed: ${err.message}` });
  }
});

router.get("/books/author/:authorKey", async (req, res) => {
  try {
    const result = await getAuthorInfo(req.params.authorKey);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Author info failed: ${err.message}` });
  }
});

// ─── Countries ─────────────────────────────────────────────────────

router.get("/countries/search/:name", async (req, res) => {
  try {
    const result = await searchCountries(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Country search failed: ${err.message}` });
  }
});

router.get("/countries/code/:code", async (req, res) => {
  try {
    const result = await getCountryByCode(req.params.code);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Country lookup failed: ${err.message}` });
  }
});

// ─── Papers (arXiv) ────────────────────────────────────────────────

router.get("/papers/search", async (req, res) => {
  const { q, category, limit, sortBy } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const result = await searchPapers(q, {
      category,
      limit: parseIntParam(limit, 10),
      sortBy: sortBy || "relevance",
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Paper search failed: ${err.message}` });
  }
});

// ─── Wikipedia Summaries ───────────────────────────────────────────

router.get("/wikipedia/summary/:title", async (req, res) => {
  try {
    const result = await getArticleSummary(req.params.title);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Wikipedia summary failed: ${err.message}` });
  }
});

router.get("/wikipedia/onthisday", async (req, res) => {
  const { type, month, day } = req.query;
  try {
    const result = await getOnThisDay(
      type || "selected",
      month ? parseInt(month, 10) : undefined,
      day ? parseInt(day, 10) : undefined,
    );
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `On This Day failed: ${err.message}` });
  }
});

// ─── Anime (Jikan / MyAnimeList) ───────────────────────────────────

router.get("/anime/search", async (req, res) => {
  const { q, limit } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const result = await searchAnime(q, parseIntParam(limit, 10));
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Anime search failed: ${err.message}` });
  }
});

router.get("/anime/top", async (req, res) => {
  const { limit } = req.query;
  try {
    const result = await getTopAnime(parseIntParam(limit, 10));
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Top anime fetch failed: ${err.message}` });
  }
});

router.get("/anime/season/now", async (req, res) => {
  const { limit } = req.query;
  try {
    const result = await getCurrentSeasonAnime(parseIntParam(limit, 10));
    res.json(result);
  } catch (err) {
    res
      .status(502)
      .json({ error: `Seasonal anime fetch failed: ${err.message}` });
  }
});

router.get("/anime/:id", async (req, res) => {
  try {
    const result = await getAnimeDetails(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Anime details failed: ${err.message}` });
  }
});

// ─── Movies (TMDb) ─────────────────────────────────────────────────

router.get("/movies/search", async (req, res) => {
  const { q, page, year } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const result = await searchMovies(q, {
      page: parseIntParam(page, 1),
      year: year ? parseInt(year, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Movie search failed: ${err.message}` });
  }
});

router.get("/movies/trending", async (req, res) => {
  const { timeWindow, limit } = req.query;
  try {
    const result = await getTrendingMovies(
      timeWindow || "day",
      parseIntParam(limit, 10),
    );
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Trending movies failed: ${err.message}` });
  }
});

router.get("/movies/discover", async (req, res) => {
  const { genreId, year, sortBy, page, minVoteAverage, minVoteCount } = req.query;
  try {
    const result = await discoverMovies({
      genreId: genreId ? parseInt(genreId, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
      sortBy,
      page: parseIntParam(page, 1),
      minVoteAverage: minVoteAverage ? parseFloat(minVoteAverage) : undefined,
      minVoteCount: minVoteCount ? parseInt(minVoteCount, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Discover movies failed: ${err.message}` });
  }
});

router.get("/movies/genres", async (_req, res) => {
  try {
    const result = await getMovieGenres();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Movie genres failed: ${err.message}` });
  }
});

router.get("/movies/:id/credits", async (req, res) => {
  try {
    const result = await getMovieCredits(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Movie credits failed: ${err.message}` });
  }
});

router.get("/movies/:id", async (req, res) => {
  try {
    const result = await getMovieDetails(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Movie details failed: ${err.message}` });
  }
});

// ─── TV Series (TMDb) ──────────────────────────────────────────────

router.get("/tv/search", async (req, res) => {
  const { q, page, firstAirDateYear } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  try {
    const result = await searchTvShows(q, {
      page: parseIntParam(page, 1),
      firstAirDateYear: firstAirDateYear ? parseInt(firstAirDateYear, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `TV search failed: ${err.message}` });
  }
});

router.get("/tv/trending", async (req, res) => {
  const { timeWindow, limit } = req.query;
  try {
    const result = await getTrendingTvShows(
      timeWindow || "day",
      parseIntParam(limit, 10),
    );
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Trending TV shows failed: ${err.message}` });
  }
});

router.get("/tv/discover", async (req, res) => {
  const { genreId, firstAirDateYear, sortBy, page, minVoteAverage, minVoteCount } = req.query;
  try {
    const result = await discoverTvShows({
      genreId: genreId ? parseInt(genreId, 10) : undefined,
      firstAirDateYear: firstAirDateYear ? parseInt(firstAirDateYear, 10) : undefined,
      sortBy,
      page: parseIntParam(page, 1),
      minVoteAverage: minVoteAverage ? parseFloat(minVoteAverage) : undefined,
      minVoteCount: minVoteCount ? parseInt(minVoteCount, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Discover TV shows failed: ${err.message}` });
  }
});

router.get("/tv/genres", async (_req, res) => {
  try {
    const result = await getTvGenres();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `TV genres failed: ${err.message}` });
  }
});

router.get("/tv/:id/credits", async (req, res) => {
  try {
    const result = await getTvShowCredits(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `TV credits failed: ${err.message}` });
  }
});

router.get("/tv/:id/season/:seasonNumber", async (req, res) => {
  try {
    const result = await getTvSeasonDetails(
      req.params.id,
      parseInt(req.params.seasonNumber, 10),
    );
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `TV season details failed: ${err.message}` });
  }
});

router.get("/tv/:id", async (req, res) => {
  try {
    const result = await getTvShowDetails(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `TV show details failed: ${err.message}` });
  }
});


// ─── Health ────────────────────────────────────────────────────────

export function getKnowledgeHealth() {
  return {
    dictionary: "on-demand",
    openLibrary: "on-demand",
    restCountries: "on-demand",
    arxiv: "on-demand",
    wikipediaSummary: "on-demand",
    jikan: "on-demand",
    tmdbMovies: "on-demand",
    tmdbTvShows: "on-demand",
  };
}

export default router;

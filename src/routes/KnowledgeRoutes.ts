import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
import { fetchDefinition } from "../fetchers/knowledge/DictionaryFetcher.ts";
import {
  searchBooks,
  getBookDetails,
  getAuthorInfo,
} from "../fetchers/knowledge/OpenLibraryFetcher.ts";
import {
  searchCountries,
  getCountryByCode,
} from "../fetchers/knowledge/RestCountriesFetcher.ts";
import { searchPapers } from "../fetchers/knowledge/ArxivFetcher.ts";
import {
  getArticleSummary,
  getOnThisDay,
} from "../fetchers/knowledge/WikipediaSummaryFetcher.ts";
import {
  searchAnime,
  getTopAnime,
  getCurrentSeasonAnime,
  getAnimeDetails,
  getSeasonAnime,
} from "../fetchers/knowledge/JikanFetcher.ts";
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
  getNowPlayingMovies,
  getUpcomingMovies,
  getAiringTodayTvShows,
  getOnTheAirTvShows,
  getMediaRecommendations,
  getMediaSimilar,
  searchPeople,
  getPersonDetails,
  getPersonCredits,
  getWatchProviders,
} from "../fetchers/knowledge/TMDbFetcher.ts";
import {
  searchElements,
  getElementBySymbol,
  rankElementsByProperty,
  getElementCategories,
} from "../fetchers/knowledge/PeriodicTableFetcher.ts";
import {
  getCountryIndicators,
  rankCountriesByIndicator,
  compareCountries,
  getAvailableIndicators,
} from "../fetchers/knowledge/WorldBankFetcher.ts";
import {
  searchExoplanets,
  getExoplanetByName,
  rankExoplanets,
  getDiscoveryStats,
  getHabitableZonePlanets,
} from "../fetchers/knowledge/ExoplanetFetcher.ts";
import { getYouTubeVideoInfo } from "../fetchers/knowledge/YouTubeFetcher.ts";
import { getGitHubRepo } from "../fetchers/web/GitHubFetcher.ts";
import { getRedditThread } from "../fetchers/web/RedditFetcher.ts";
import {
  getRedditUserHistory,
  getRedditUserProfile,
} from "../fetchers/web/RedditUserFetcher.ts";
import { searchReddit } from "../fetchers/web/RedditSearchFetcher.ts";
import {
  searchSubreddits,
  getSubredditInfo,
  getSubredditFeed,
  getSubredditRules,
  getSubredditWikiPages,
  getSubredditWikiPage,
} from "../fetchers/web/RedditSubredditFetcher.ts";
import { downloadRedditVideo } from "../fetchers/web/RedditVideoFetcher.ts";
import { downloadYouTubeVideo } from "../fetchers/web/YouTubeVideoFetcher.ts";
import { getNpmPackage } from "../fetchers/web/NpmFetcher.ts";
import { getPyPiPackage } from "../fetchers/web/PyPiFetcher.ts";

import { readRssFeed } from "../fetchers/web/RssFetcher.ts";
import { getTwitterPost } from "../fetchers/web/TwitterFetcher.ts";
import { getHackerNewsThread } from "../fetchers/web/HackerNewsFetcher.ts";
import { getStackOverflowQuestion } from "../fetchers/web/StackOverflowFetcher.ts";
import { getWebContent } from "../fetchers/web/WebContentFetcher.ts";
import { getPackageInfo } from "../fetchers/web/PackageFetcher.ts";
import {
  searchArtists,
  getArtist,
  searchAlbums,
  getAlbum,
  searchTracks,
} from "../fetchers/knowledge/MusicBrainzFetcher.ts";
import {
  getSnapshot as getWaybackSnapshot,
  getSnapshotHistory,
} from "../fetchers/web/WaybackFetcher.ts";
import { errorMessage } from "../utilities.ts";

const router: ReturnType<typeof Router> = Router();
const dispatchToRoute = router as unknown as (request: Request, response: Response, fallback: () => void) => void;
// ─── Dictionary ────────────────────────────────────────────────────
router.get(
  "/dictionary/:word",
  asyncHandler(
    (req: Request) => fetchDefinition(req.params.word as string),
    "Dictionary lookup",
  ),
);
// ─── Books ─────────────────────────────────────────────────────────
router.get(
  "/books/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(await searchBooks(query, parseIntParam(limit, 10)));
  }),
);
router.get(
  "/books/work/:workKey",
  asyncHandler(
    (req: Request) => getBookDetails(req.params.workKey as string),
    "Book details",
  ),
);
router.get(
  "/books/author/:authorKey",
  asyncHandler(
    (req: Request) => getAuthorInfo(req.params.authorKey as string),
    "Author info",
  ),
);
// ─── Countries ─────────────────────────────────────────────────────
router.get(
  "/countries/search/:name",
  asyncHandler(
    (req: Request) => searchCountries(req.params.name as string),
    "Country search",
  ),
);
router.get(
  "/countries/code/:code",
  asyncHandler(
    (req: Request) => getCountryByCode(req.params.code as string),
    "Country lookup",
  ),
);
// ─── Papers (arXiv) ────────────────────────────────────────────────
router.get(
  "/papers/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const category = req.query.category as string | undefined;
    const limit = req.query.limit as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(
      await searchPapers(query, {
        category,
        limit: parseIntParam(limit, 10),
        sortBy: sortBy || "relevance",
      }),
    );
  }),
);
// ─── Wikipedia Summaries ───────────────────────────────────────────
router.get(
  "/wikipedia/summary/:title",
  asyncHandler(
    (req: Request) => getArticleSummary(req.params.title as string),
    "Wikipedia summary",
  ),
);
router.get(
  "/wikipedia/onthisday",
  asyncHandler(
    (req: Request) =>
      getOnThisDay(
        (req.query.type as string) || "selected",
        (req.query.month as string)
          ? parseInt(req.query.month as string, 10)
          : undefined,
        (req.query.day as string)
          ? parseInt(req.query.day as string, 10)
          : undefined,
      ),
    "On This Day",
  ),
);
// ─── Anime (Jikan / MyAnimeList) ───────────────────────────────────
router.get(
  "/anime/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(await searchAnime(query, parseIntParam(limit, 10)));
  }),
);
router.get(
  "/anime/top",
  asyncHandler(
    (req: Request) => getTopAnime(parseIntParam(req.query.limit as string, 10)),
    "Top anime fetch",
  ),
);
router.get(
  "/anime/season/now",
  asyncHandler(
    (req: Request) =>
      getCurrentSeasonAnime(parseIntParam(req.query.limit as string, 10)),
    "Seasonal anime fetch",
  ),
);
router.get(
  "/anime/:id",
  asyncHandler(
    (req: Request) => getAnimeDetails(req.params.id as string),
    "Anime details",
  ),
);
// ─── Movies (TMDb) ─────────────────────────────────────────────────
router.get(
  "/movies/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const page = req.query.page as string | undefined;
    const year = req.query.year as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(
      await searchMovies(query, {
        page: parseIntParam(page, 1),
        year: year ? parseInt(year, 10) : undefined,
      }),
    );
  }),
);
router.get(
  "/movies/trending",
  asyncHandler(
    (req: Request) =>
      getTrendingMovies(
        (req.query.timeWindow as string) || "day",
        parseIntParam(req.query.limit as string, 10),
      ),
    "Trending movies",
  ),
);
router.get(
  "/movies/discover",
  asyncHandler((req: Request) => {
    const { genreId, year, sortBy, page, minVoteAverage, minVoteCount } =
      req.query as Record<string, string | undefined>;
    return discoverMovies({
      genreId: genreId ? parseInt(genreId, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
      sortBy,
      page: parseIntParam(page, 1),
      minVoteAverage: minVoteAverage ? parseFloat(minVoteAverage) : undefined,
      minVoteCount: minVoteCount ? parseInt(minVoteCount, 10) : undefined,
    });
  }, "Discover movies"),
);
router.get(
  "/movies/genres",
  asyncHandler(async () => getMovieGenres(), "Movie genres"),
);
router.get(
  "/movies/:id/credits",
  asyncHandler(
    (req: Request) => getMovieCredits(req.params.id as string),
    "Movie credits",
  ),
);
router.get(
  "/movies/:id",
  asyncHandler(
    (req: Request) => getMovieDetails(req.params.id as string),
    "Movie details",
  ),
);
// ─── TV Series (TMDb) ──────────────────────────────────────────────
router.get(
  "/tv/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const page = req.query.page as string | undefined;
    const firstAirDateYear = req.query.firstAirDateYear as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(
      await searchTvShows(query, {
        page: parseIntParam(page, 1),
        firstAirDateYear: firstAirDateYear
          ? parseInt(firstAirDateYear, 10)
          : undefined,
      }),
    );
  }),
);
router.get(
  "/tv/trending",
  asyncHandler(
    (req: Request) =>
      getTrendingTvShows(
        (req.query.timeWindow as string) || "day",
        parseIntParam(req.query.limit as string, 10),
      ),
    "Trending TV shows",
  ),
);
router.get(
  "/tv/discover",
  asyncHandler((req: Request) => {
    const {
      genreId,
      firstAirDateYear,
      sortBy,
      page,
      minVoteAverage,
      minVoteCount,
    } = req.query as Record<string, string | undefined>;
    return discoverTvShows({
      genreId: genreId ? parseInt(genreId, 10) : undefined,
      firstAirDateYear: firstAirDateYear
        ? parseInt(firstAirDateYear, 10)
        : undefined,
      sortBy,
      page: parseIntParam(page, 1),
      minVoteAverage: minVoteAverage ? parseFloat(minVoteAverage) : undefined,
      minVoteCount: minVoteCount ? parseInt(minVoteCount, 10) : undefined,
    });
  }, "Discover TV shows"),
);
router.get(
  "/tv/genres",
  asyncHandler(async () => getTvGenres(), "TV genres"),
);
router.get(
  "/tv/:id/credits",
  asyncHandler(
    (req: Request) => getTvShowCredits(req.params.id as string),
    "TV credits",
  ),
);
router.get(
  "/tv/:id/season/:seasonNumber",
  asyncHandler(
    (req: Request) =>
      getTvSeasonDetails(
        req.params.id as string,
        parseInt(req.params.seasonNumber as string, 10),
      ),
    "TV season details",
  ),
);
router.get(
  "/tv/:id",
  asyncHandler(
    (req: Request) => getTvShowDetails(req.params.id as string),
    "TV show details",
  ),
);
// ─── Periodic Table (in-memory) ────────────────────────────────────
router.get("/elements/search", (req: Request, res: Response) => {
  const query = req.query['q'] as string | undefined;
  const limit = req.query.limit as string | undefined;
  const category = req.query.category as string | undefined;
  const block = req.query.block as string | undefined;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(
    searchElements(query, {
      limit: parseIntParam(limit, 10),
      category,
      block,
    }),
  );
});
router.get("/elements/rank", (req: Request, res: Response) => {
  const { property, limit, order, category, block } = req.query as Record<
    string,
    string | undefined
  >;
  if (!property) {
    return res
      .status(400)
      .json({ error: "Query parameter 'property' is required" });
  }
  const result = rankElementsByProperty(property, {
    limit: parseIntParam(limit, 10),
    order: order === "asc" || order === "desc" ? order : "desc",
    category,
    block,
  });
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get(
  "/elements/categories",
  asyncHandler(async () => getElementCategories(), "Element categories", 500),
);
router.get("/elements/:symbol", (req: Request, res: Response) => {
  const result = getElementBySymbol(req.params.symbol as string);
  if (!result) {
    return res
      .status(404)
      .json({ error: `Element not found: ${req.params.symbol as string}` });
  }
  res.json(result);
});
// ─── World Bank Indicators (in-memory) ─────────────────────────────
router.get("/indicators/country/:code", (req: Request, res: Response) => {
  const result = getCountryIndicators(req.params.code as string);
  if (!result) {
    return res
      .status(404)
      .json({ error: `Country not found: ${req.params.code as string}` });
  }
  res.json(result);
});
router.get("/indicators/rank", (req: Request, res: Response) => {
  const { indicator, limit, order } = req.query as Record<
    string,
    string | undefined
  >;
  if (!indicator) {
    return res
      .status(400)
      .json({ error: "Query parameter 'indicator' is required" });
  }
  const result = rankCountriesByIndicator(indicator, {
    limit: parseIntParam(limit, 10),
    order: order === "asc" || order === "desc" ? order : "desc",
  });
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get("/indicators/compare", (req: Request, res: Response) => {
  const { countries, indicator } = req.query as Record<
    string,
    string | undefined
  >;
  if (!countries) {
    return res.status(400).json({
      error:
        "Query parameter 'countries' is required (comma-separated ISO alpha-3 codes)",
    });
  }
  const codes = countries
    .split(",")
    .map((client: string) => client.trim())
    .filter(Boolean);
  if (codes.length < 2) {
    return res
      .status(400)
      .json({ error: "At least 2 country codes required for comparison" });
  }
  const result = compareCountries(codes, indicator || null);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get(
  "/indicators/list",
  asyncHandler(async () => getAvailableIndicators(), "Indicator list", 500),
);
// ─── Exoplanets ────────────────────────────────────────────────────
router.get("/exoplanets/search", (req: Request, res: Response) => {
  const query = req.query['q'] as string | undefined;
  const limit = req.query.limit as string | undefined;
  const method = req.query.method as string | undefined;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(
    searchExoplanets(query, {
      limit: parseIntParam(limit, 10),
      method,
    }),
  );
});
router.get("/exoplanets/lookup/:name", (req: Request, res: Response) => {
  const result = getExoplanetByName(req.params.name as string);
  if (!result) {
    return res
      .status(404)
      .json({ error: `Exoplanet not found: ${req.params.name as string}` });
  }
  res.json(result);
});
router.get("/exoplanets/rank", (req: Request, res: Response) => {
  const { field, limit, order } = req.query as Record<
    string,
    string | undefined
  >;
  if (!field) {
    return res
      .status(400)
      .json({ error: "Query parameter 'field' is required" });
  }
  res.json(
    rankExoplanets(field, {
      limit: parseIntParam(limit, 10),
      order: order === "asc" || order === "desc" ? order : "desc",
    }),
  );
});
router.get(
  "/exoplanets/stats",
  asyncHandler(async () => getDiscoveryStats(), "Exoplanet stats", 500),
);
router.get(
  "/exoplanets/habitable",
  asyncHandler(
    async (req: Request) =>
      getHabitableZonePlanets({
        limit: parseIntParam(req.query.limit as string, 20),
      }),
    "Habitable zone query",
    500,
  ),
);
// ─── YouTube ───────────────────────────────────────────────────────
router.get(
  "/youtube/video",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, lang, transcript, timestamps } = req.query as Record<
      string,
      string | undefined
    >;
    if (!url) {
      return res.status(400).json({
        error: "Query parameter 'url' is required (YouTube URL or video ID)",
      });
    }
    const result = await getYouTubeVideoInfo(url, {
      lang,
      includeTranscript: transcript !== "false",
      includeTimestamps: timestamps !== "false",
    });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── YouTube Video Download ───────────────────────────────────────
router.get(
  "/youtube/download",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, format } = req.query as Record<string, string | undefined>;
    if (!url) {
      return res.status(400).json({
        error: "Query parameter 'url' is required (YouTube URL or video ID)",
      });
    }
    const downloadFormat =
      format === "mp3" ? "mp3" as const : "mp4" as const;
    const result = await downloadYouTubeVideo(url, downloadFormat);
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json({
      success: true,
      message: `Video downloaded and delivered to the user: "${result.title}" by ${result.channel} (${result.durationSeconds ?? "?"}s, ${(result.fileSize / 1024 / 1024).toFixed(1)} MB).`,
      title: result.title,
      channel: result.channel,
      durationSeconds: result.durationSeconds,
      viewCount: result.viewCount,
      uploadDate: result.uploadDate,
      thumbnailUrl: result.thumbnailUrl,
      fileSize: result.fileSize,
      format: result.format,
      video: {
        data: result.videoBase64,
        mimeType: result.mimeType,
      },
    });
  }),
);
// ─── GitHub ────────────────────────────────────────────────────────
router.get(
  "/github/repo",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, readme, languages } = req.query as Record<
      string,
      string | undefined
    >;
    if (!url) {
      return res.status(400).json({
        error: "Query parameter 'url' is required (GitHub URL or owner/repo)",
      });
    }
    const result = await getGitHubRepo(url, {
      includeReadme: readme !== "false",
      includeLanguages: languages !== "false",
    });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Reddit ────────────────────────────────────────────────────────
router.get(
  "/reddit/thread",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, commentLimit } = req.query as Record<
      string,
      string | undefined
    >;
    if (!url) {
      return res
        .status(400)
        .json({ error: "Query parameter 'url' is required (Reddit URL)" });
    }
    const result = await getRedditThread(url, {
      commentLimit: commentLimit ? parseIntParam(commentLimit, 20) : undefined,
    });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/user/:username",
  asyncHandler(async (req: Request, res: Response) => {
    const username = req.params.username as string;
    if (!username) {
      return res
        .status(400)
        .json({ error: "URL parameter 'username' is required" });
    }
    const category = req.query.category as string | undefined;
    const limit = req.query.limit as string | undefined;
    const maxPages = req.query.maxPages as string | undefined;
    const sort = req.query.sort as string | undefined;
    const timeRange = req.query['t'] as string | undefined;
    const result = await getRedditUserHistory(username, {
      category: category as
        | "overview"
        | "comments"
        | "submitted"
        | "gilded"
        | undefined,
      limit: limit ? parseIntParam(limit, 25) : undefined,
      maxPages: maxPages ? parseIntParam(maxPages, 10) : undefined,
      sort: sort as "new" | "hot" | "top" | "controversial" | undefined,
      timeRange: timeRange as
        | "hour"
        | "day"
        | "week"
        | "month"
        | "year"
        | "all"
        | undefined,
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/user/:username/profile",
  asyncHandler(async (req: Request, res: Response) => {
    const username = req.params.username as string;
    if (!username) {
      return res
        .status(400)
        .json({ error: "URL parameter 'username' is required" });
    }
    const result = await getRedditUserProfile(username);
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const subreddit = req.query.subreddit as string | undefined;
    const type = req.query.type as string | undefined;
    const sort = req.query.sort as string | undefined;
    const timeRange = req.query['t'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    const maxPages = req.query.maxPages as string | undefined;
    const nsfw = req.query.nsfw as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const result = await searchReddit(query, {
      subreddit,
      type: type as "link" | "comment" | undefined,
      sort: sort as
        | "relevance"
        | "new"
        | "hot"
        | "top"
        | "comments"
        | undefined,
      timeRange: timeRange as
        | "hour"
        | "day"
        | "week"
        | "month"
        | "year"
        | "all"
        | undefined,
      limit: limit ? parseIntParam(limit, 25) : undefined,
      maxPages: maxPages ? parseIntParam(maxPages, 5) : undefined,
      includeNsfw: nsfw === "true",
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/subreddits/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    const nsfw = req.query.nsfw as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const result = await searchSubreddits(query, {
      limit: limit ? parseIntParam(limit, 10) : undefined,
      includeNsfw: nsfw === "true",
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/r/:subreddit/info",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getSubredditInfo(req.params.subreddit as string);
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/r/:subreddit/feed",
  asyncHandler(async (req: Request, res: Response) => {
    const sort = req.query.sort as string | undefined;
    const timeRange = req.query['t'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    const pinned = req.query.pinned as string | undefined;
    const result = await getSubredditFeed(req.params.subreddit as string, {
      sort: sort as
        | "hot"
        | "new"
        | "top"
        | "rising"
        | "controversial"
        | undefined,
      timeRange: timeRange as
        | "hour"
        | "day"
        | "week"
        | "month"
        | "year"
        | "all"
        | undefined,
      limit: limit ? parseIntParam(limit, 25) : undefined,
      excludePinned: pinned !== "true",
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/r/:subreddit/rules",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getSubredditRules(req.params.subreddit as string);
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/r/:subreddit/wiki",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getSubredditWikiPages(req.params.subreddit as string);
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
router.get(
  "/reddit/r/:subreddit/wiki/:page",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getSubredditWikiPage(
      req.params.subreddit as string,
      req.params.page as string,
    );
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Reddit Video Download ─────────────────────────────────────────
router.get(
  "/reddit/video",
  asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.query as Record<string, string | undefined>;
    if (!url) {
      return res
        .status(400)
        .json({ error: "Query parameter 'url' is required (Reddit post or v.redd.it URL)" });
    }
    const result = await downloadRedditVideo(url);
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json({
      success: true,
      message: `Video downloaded and delivered to the user: "${result.title}" (${result.durationSeconds ?? "?"}s, ${(result.fileSize / 1024 / 1024).toFixed(1)} MB).`,
      title: result.title,
      author: result.author,
      subreddit: result.subreddit,
      permalink: result.permalink,
      isNsfw: result.isNsfw,
      durationSeconds: result.durationSeconds,
      widthPixels: result.widthPixels,
      heightPixels: result.heightPixels,
      fileSize: result.fileSize,
      video: {
        data: result.videoBase64,
        mimeType: result.mimeType,
      },
    });
  }),
);
// ─── NPM ───────────────────────────────────────────────────────────
router.get(
  "/npm/package",
  asyncHandler(async (req: Request, res: Response) => {
    const { name, readme } = req.query as Record<string, string | undefined>;
    if (!name) {
      return res.status(400).json({
        error: "Query parameter 'name' is required (NPM package name)",
      });
    }
    const result = await getNpmPackage(name, {
      includeReadme: readme !== "false",
    });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── PyPI ──────────────────────────────────────────────────────────
router.get(
  "/pypi/package",
  asyncHandler(
    (req: Request) => getPyPiPackage(req.query.name as string),
    "PyPI lookup",
  ),
);

// ─── RSS ───────────────────────────────────────────────────────────
router.get(
  "/rss/feed",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, limit } = req.query as Record<string, string | undefined>;
    if (!url) {
      return res.status(400).json({
        error: "Query parameter 'url' is required (RSS/Atom feed URL)",
      });
    }
    const result = await readRssFeed(url, {
      limit: limit ? parseIntParam(limit, 20) : undefined,
    });
    if (result && typeof result === "object" && "error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Twitter/X ─────────────────────────────────────────────────────
router.get(
  "/twitter/post",
  asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.query as Record<string, string | undefined>;
    if (!url) {
      return res.status(400).json({
        error: "Query parameter 'url' is required (Twitter/X URL or tweet ID)",
      });
    }
    const result = await getTwitterPost(url);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Hacker News ───────────────────────────────────────────────────
router.get(
  "/hackernews/thread",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, commentLimit } = req.query as Record<
      string,
      string | undefined
    >;
    if (!url) {
      return res.status(400).json({
        error: "Query parameter 'url' is required (HN URL or item ID)",
      });
    }
    const result = await getHackerNewsThread(url, {
      commentLimit: commentLimit ? parseIntParam(commentLimit, 25) : undefined,
    });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Stack Overflow ────────────────────────────────────────────────
router.get(
  "/stackoverflow/question",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, answerLimit } = req.query as Record<
      string,
      string | undefined
    >;
    if (!url) {
      return res.status(400).json({
        error:
          "Query parameter 'url' is required (Stack Overflow URL or question ID)",
      });
    }
    const result = await getStackOverflowQuestion(url, {
      answerLimit: answerLimit ? parseIntParam(answerLimit, 5) : undefined,
    });
    if (result && typeof result === "object" && "error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Unified: Web Content (YouTube/Reddit/Twitter/HN/SO/GitHub) ───
router.get(
  "/web/content",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      url,
      commentLimit,
      answerLimit,
      transcript,
      lang,
      readme,
      languages,
      maxChars,
    } = req.query as Record<string, string | undefined>;
    if (!url) {
      return res
        .status(400)
        .json({ error: "Query parameter 'url' is required" });
    }
    const result = await getWebContent(url, {
      commentLimit,
      answerLimit,
      transcript,
      lang,
      readme,
      languages,
      maxChars: maxChars ? parseInt(maxChars, 10) : undefined,
    });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Unified: Package Info (NPM/PyPI) ─────────────────────────────
router.get(
  "/package/info",
  asyncHandler(async (req: Request, res: Response) => {
    const { name, registry, readme } = req.query as Record<
      string,
      string | undefined
    >;
    if (!name) {
      return res
        .status(400)
        .json({ error: "Query parameter 'name' is required" });
    }
    if (!registry) {
      return res.status(400).json({
        error: "Query parameter 'registry' is required ('npm' or 'pypi')",
      });
    }
    const result = await getPackageInfo(name, registry, { readme });
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
// ─── Music (MusicBrainz) ───────────────────────────────────────────
router.get(
  "/music/artists/search",
  asyncHandler(async (req: Request, res: Response) => {
    const searchQuery = req.query['q'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!searchQuery)
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    res.json(await searchArtists(searchQuery, parseIntParam(limit, 10)));
  }),
);
router.get(
  "/music/artists/:mbid",
  asyncHandler(
    (req: Request) => getArtist(req.params.mbid as string),
    "Artist details",
  ),
);
router.get(
  "/music/albums/search",
  asyncHandler(async (req: Request, res: Response) => {
    const searchQuery = req.query['q'] as string | undefined;
    const artist = req.query.artist as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!searchQuery)
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    res.json(await searchAlbums(searchQuery, artist, parseIntParam(limit, 10)));
  }),
);
router.get(
  "/music/albums/:mbid",
  asyncHandler(
    (req: Request) => getAlbum(req.params.mbid as string),
    "Album details",
  ),
);
router.get(
  "/music/tracks/search",
  asyncHandler(async (req: Request, res: Response) => {
    const searchQuery = req.query['q'] as string | undefined;
    const artist = req.query.artist as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!searchQuery)
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    res.json(await searchTracks(searchQuery, artist, parseIntParam(limit, 10)));
  }),
);
// ─── Wayback Machine ───────────────────────────────────────────────
router.get(
  "/wayback/snapshot",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, timestamp } = req.query as Record<string, string | undefined>;
    if (!url)
      return res
        .status(400)
        .json({ error: "Query parameter 'url' is required" });
    try {
      res.json(await getWaybackSnapshot(url, timestamp));
    } catch (error: unknown) {
      res
        .status(500)
        .json({ error: `Wayback lookup failed: ${errorMessage(error)}` });
    }
  }),
);
router.get(
  "/wayback/history",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, limit, from, to } = req.query as Record<
      string,
      string | undefined
    >;
    if (!url)
      return res
        .status(400)
        .json({ error: "Query parameter 'url' is required" });
    try {
      res.json(
        await getSnapshotHistory(url, {
          limit: parseIntParam(limit, 20),
          from,
          to,
        }),
      );
    } catch (error: unknown) {
      res
        .status(500)
        .json({ error: `Wayback history failed: ${errorMessage(error)}` });
    }
  }),
);
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
    periodicTable: "on-demand (in-memory, 119 elements)",
    worldBankIndicators: "on-demand (in-memory, 217 countries)",
    nasaExoplanets: "on-demand (in-memory, ~6,153 planets)",
    youtube: "on-demand (oEmbed + youtube-transcript)",
    github: "on-demand (GitHub REST API v3)",
    reddit:
      "on-demand (.json API + OAuth2: user history, search, subreddit discovery/feed/wiki/rules, video download via yt-dlp)",
    npm: "on-demand (NPM Registry)",
    pypi: "on-demand (PyPI JSON API)",

    rss: "on-demand (xml2js)",
    twitter: "on-demand (fxtwitter + oembed)",
    hackerNews: "on-demand (Firebase API)",
    stackOverflow: "on-demand (Stack Exchange API v2.3)",
    webContent:
      "unified (YouTube/Reddit/Twitter/HN/SO/GitHub + generic fallback)",
    packageInfo: "unified (NPM/PyPI)",
    musicBrainz: "on-demand (MusicBrainz API)",
    waybackMachine: "on-demand (Internet Archive)",
  };
}
// ═══════════════════════════════════════════════════════════════════
// UNIFIED DISPATCHERS
// ═══════════════════════════════════════════════════════════════════
// ── Unified Book Lookup ────────────────────────────────────────────
router.get(
  "/books/lookup",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const workKey = req.query.workKey as string | undefined;
    const authorKey = req.query.authorKey as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["search", "work", "author"],
      });
    switch (action) {
      case "search":
        req.url = `/books/search?q=${searchQuery || ""}&limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "work":
        req.url = `/books/work/${workKey || ""}`;
        req.params.workKey = workKey || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "author":
        req.url = `/books/author/${authorKey || ""}`;
        req.params.authorKey = authorKey || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: ["search", "work", "author"],
        });
    }
  }),
);
// ── Unified Country Data ───────────────────────────────────────────
router.get(
  "/countries/data",
  asyncHandler(async (req: Request, res: Response) => {
    const { action, name, code, indicator, countries, limit, order } =
      req.query as Record<string, string | undefined>;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["info", "code", "indicators", "rank", "compare"],
      });
    switch (action) {
      case "info":
        req.url = `/countries/search/${encodeURIComponent(name || "")}`;
        req.params.name = name || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "code":
        req.url = `/countries/code/${code || ""}`;
        req.params.code = code || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "indicators":
        req.url = `/indicators/country/${code || ""}`;
        req.params.code = code || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "rank":
        req.url = `/indicators/rank?indicator=${indicator || ""}&limit=${limit || 10}&order=${order || "desc"}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "compare":
        req.url = `/indicators/compare?countries=${countries || ""}&indicator=${indicator || ""}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: ["info", "code", "indicators", "rank", "compare"],
        });
    }
  }),
);
// ── Unified Element Data ───────────────────────────────────────────
router.get(
  "/elements/data",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const symbol = req.query.symbol as string | undefined;
    const property = req.query.property as string | undefined;
    const limit = req.query.limit as string | undefined;
    const order = req.query.order as string | undefined;
    const category = req.query.category as string | undefined;
    const block = req.query.block as string | undefined;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["search", "lookup", "rank", "categories"],
      });
    switch (action) {
      case "search":
        req.url = `/elements/search?q=${searchQuery || ""}&limit=${limit || 10}&category=${category || ""}&block=${block || ""}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "lookup":
        req.url = `/elements/${symbol || ""}`;
        req.params.symbol = symbol || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "rank":
        req.url = `/elements/rank?property=${property || ""}&limit=${limit || 10}&order=${order || "desc"}&category=${category || ""}&block=${block || ""}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "categories":
        req.url = "/elements/categories";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: ["search", "lookup", "rank", "categories"],
        });
    }
  }),
);
// ── Unified Exoplanet Data ─────────────────────────────────────────
router.get(
  "/exoplanets/data",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const name = req.query.name as string | undefined;
    const field = req.query.field as string | undefined;
    const limit = req.query.limit as string | undefined;
    const order = req.query.order as string | undefined;
    const method = req.query.method as string | undefined;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["search", "lookup", "rank", "stats", "habitable"],
      });
    switch (action) {
      case "search":
        req.url = `/exoplanets/search?q=${searchQuery || ""}&limit=${limit || 10}&method=${method || ""}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "lookup":
        req.url = `/exoplanets/lookup/${encodeURIComponent(name || "")}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "rank":
        req.url = `/exoplanets/rank?field=${field || ""}&limit=${limit || 10}&order=${order || "desc"}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "stats":
        req.url = "/exoplanets/stats";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "habitable":
        req.url = `/exoplanets/habitable?limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: ["search", "lookup", "rank", "stats", "habitable"],
        });
    }
  }),
);
// ── Unified Anime Data ─────────────────────────────────────────────
router.get(
  "/anime/data",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const id = req.query.id as string | undefined;
    const limit = req.query.limit as string | undefined;
    const year = req.query.year as string | undefined;
    const season = req.query.season as string | undefined;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["search", "top", "season", "schedule", "details"],
      });
    switch (action) {
      case "search":
        req.url = `/anime/search?q=${searchQuery || ""}&limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "top":
        req.url = `/anime/top?limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "season":
        req.url = `/anime/season/now?limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "schedule":
        if (!year || !season)
          return res.status(400).json({ error: "'year' and 'season' are required for action=schedule" });
        return res.json(await getSeasonAnime(year, season, parseIntParam(limit, 25)));
      case "details":
        req.url = `/anime/${id || ""}`;
        req.params.id = id || "";
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: ["search", "top", "season", "schedule", "details"],
        });
    }
  }),
);
// ── Unified Media (Movies & TV) ────────────────────────────────────
router.get(
  "/media/search",
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const year = req.query.year as string | undefined;
    const page = req.query.page as string | undefined;
    if (!type || !searchQuery)
      return res.status(400).json({ error: "'type' and 'q' are required" });
    req.url = `/${type === "tv" ? "tv" : "movies"}/search?q=${searchQuery}&year=${year || ""}&page=${page || 1}${type === "tv" ? "&firstAirDateYear=" + (year || "") : ""}`;
    return dispatchToRoute(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
router.get(
  "/media/trending",
  asyncHandler(async (req: Request, res: Response) => {
    const { type, timeWindow, limit } = req.query as Record<
      string,
      string | undefined
    >;
    if (!type) return res.status(400).json({ error: "'type' is required" });
    req.url = `/${type === "tv" ? "tv" : "movies"}/trending?timeWindow=${timeWindow || "week"}&limit=${limit || 10}`;
    return dispatchToRoute(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
router.get(
  "/media/discover",
  asyncHandler(async (req: Request, res: Response) => {
    const { type, genreId, year, sortBy, page, minVoteAverage, minVoteCount } =
      req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required" });
    const yearParam =
      type === "tv" ? `firstAirDateYear=${year || ""}` : `year=${year || ""}`;
    req.url = `/${type === "tv" ? "tv" : "movies"}/discover?${yearParam}&genreId=${genreId || ""}&sortBy=${sortBy || ""}&page=${page || 1}&minVoteAverage=${minVoteAverage || ""}&minVoteCount=${minVoteCount || ""}`;
    return dispatchToRoute(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
router.get(
  "/media/genres",
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required" });
    req.url = `/${type === "tv" ? "tv" : "movies"}/genres`;
    return dispatchToRoute(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
router.get(
  "/media/:id/credits",
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required" });
    req.url = `/${type === "tv" ? "tv" : "movies"}/${req.params.id as string}/credits`;
    return dispatchToRoute(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
router.get(
  "/media/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required" });
    req.url = `/${type === "tv" ? "tv" : "movies"}/${req.params.id as string}`;
    return dispatchToRoute(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
// ── Now Playing / Upcoming / Airing Media ──────────────────────────
router.get(
  "/media/now-playing",
  asyncHandler(async (req: Request, res: Response) => {
    const { action, region, page, limit } = req.query as Record<string, string | undefined>;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["now_playing", "upcoming", "airing_today", "on_the_air"],
      });

    const parsedPage = parseIntParam(page, 1);
    const parsedLimit = parseIntParam(limit, 20);

    switch (action) {
      case "now_playing":
        return res.json(await getNowPlayingMovies(region || "US", parsedPage, parsedLimit));
      case "upcoming":
        return res.json(await getUpcomingMovies(region || "US", parsedPage, parsedLimit));
      case "airing_today":
        return res.json(await getAiringTodayTvShows(parsedPage, parsedLimit));
      case "on_the_air":
        return res.json(await getOnTheAirTvShows(parsedPage, parsedLimit));
      default:
        return res.status(400).json({
          error: `Unknown action '${action}'`,
          actions: ["now_playing", "upcoming", "airing_today", "on_the_air"],
        });
    }
  }),
);
// ── Media Recommendations & Similar ────────────────────────────────
router.get(
  "/media/:id/recommendations",
  asyncHandler(async (req: Request, res: Response) => {
    const { type, action, limit } = req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required (movie or tv)" });
    const parsedLimit = parseIntParam(limit, 10);
    const resolvedAction = action || "recommendations";
    if (resolvedAction === "similar") {
      return res.json(await getMediaSimilar(type as "movie" | "tv", req.params.id as string, parsedLimit));
    }
    return res.json(await getMediaRecommendations(type as "movie" | "tv", req.params.id as string, parsedLimit));
  }),
);
router.get(
  "/media/:id/similar",
  asyncHandler(async (req: Request, res: Response) => {
    const { type, limit } = req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required (movie or tv)" });
    const parsedLimit = parseIntParam(limit, 10);
    return res.json(await getMediaSimilar(type as "movie" | "tv", req.params.id as string, parsedLimit));
  }),
);
// ── Person / Actor Search ──────────────────────────────────────────
router.get(
  "/person/search",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const id = req.query.id as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["search", "details", "filmography"],
      });

    switch (action) {
      case "search":
        if (!searchQuery) return res.status(400).json({ error: "'q' is required for action=search" });
        return res.json(await searchPeople(searchQuery, parseIntParam(limit, 10)));
      case "details":
        if (!id) return res.status(400).json({ error: "'id' is required for action=details" });
        return res.json(await getPersonDetails(id));
      case "filmography":
        if (!id) return res.status(400).json({ error: "'id' is required for action=filmography" });
        return res.json(await getPersonCredits(id, parseIntParam(limit, 30)));
      default:
        return res.status(400).json({
          error: `Unknown action '${action}'`,
          actions: ["search", "details", "filmography"],
        });
    }
  }),
);
router.get(
  "/person/:id/credits",
  asyncHandler(async (req: Request, res: Response) => {
    const { limit } = req.query as Record<string, string | undefined>;
    return res.json(await getPersonCredits(req.params.id as string, parseIntParam(limit, 30)));
  }),
);
router.get(
  "/person/:id",
  asyncHandler(async (req: Request, res: Response) => {
    return res.json(await getPersonDetails(req.params.id as string));
  }),
);
// ── Watch Providers ────────────────────────────────────────────────
router.get(
  "/media/:id/watch-providers",
  asyncHandler(async (req: Request, res: Response) => {
    const { type, region } = req.query as Record<string, string | undefined>;
    if (!type) return res.status(400).json({ error: "'type' is required (movie or tv)" });
    return res.json(await getWatchProviders(type as "movie" | "tv", req.params.id as string, region || "US"));
  }),
);
// ── Unified Music Data ─────────────────────────────────────────────
router.get(
  "/music",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const searchQuery = req.query['q'] as string | undefined;
    const mbid = req.query.mbid as string | undefined;
    const artist = req.query.artist as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: [
          "search_artists",
          "artist",
          "search_albums",
          "album",
          "search_tracks",
        ],
      });
    switch (action) {
      case "search_artists":
        if (!searchQuery)
          return res
            .status(400)
            .json({ error: "'q' is required for action=search_artists" });
        req.url = `/music/artists/search?q=${encodeURIComponent(searchQuery)}&limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "artist":
        if (!mbid)
          return res
            .status(400)
            .json({ error: "'mbid' is required for action=artist" });
        req.url = `/music/artists/${mbid}`;
        req.params.mbid = mbid;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "search_albums":
        if (!searchQuery)
          return res
            .status(400)
            .json({ error: "'q' is required for action=search_albums" });
        req.url = `/music/albums/search?q=${encodeURIComponent(searchQuery)}&artist=${artist || ""}&limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "album":
        if (!mbid)
          return res
            .status(400)
            .json({ error: "'mbid' is required for action=album" });
        req.url = `/music/albums/${mbid}`;
        req.params.mbid = mbid;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "search_tracks":
        if (!searchQuery)
          return res
            .status(400)
            .json({ error: "'q' is required for action=search_tracks" });
        req.url = `/music/tracks/search?q=${encodeURIComponent(searchQuery)}&artist=${artist || ""}&limit=${limit || 10}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: [
            "search_artists",
            "artist",
            "search_albums",
            "album",
            "search_tracks",
          ],
        });
    }
  }),
);
// ── Unified Wayback Machine ────────────────────────────────────────
router.get(
  "/wayback",
  asyncHandler(async (req: Request, res: Response) => {
    const { action, url, timestamp, limit, from, to } = req.query as Record<
      string,
      string | undefined
    >;
    if (!action)
      return res.status(400).json({
        error: "'action' is required",
        actions: ["snapshot", "history"],
      });
    if (!url) return res.status(400).json({ error: "'url' is required" });
    switch (action) {
      case "snapshot":
        req.url = `/wayback/snapshot?url=${encodeURIComponent(url)}${timestamp ? "&timestamp=" + timestamp : ""}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      case "history":
        req.url = `/wayback/history?url=${encodeURIComponent(url)}&limit=${limit || 20}${from ? "&from=" + from : ""}${to ? "&to=" + to : ""}`;
        return dispatchToRoute(req, res, () =>
          res.status(404).json({ error: "Route not found" }),
        );
      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          actions: ["snapshot", "history"],
        });
    }
  }),
);
// ─── Stack Overflow Questions Search ───────────────────────────────
import { searchStackOverflowQuestions } from "../fetchers/web/StackOverflowFetcher.ts";

router.get(
  "/stackoverflow/questions",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const tagged = req.query.tagged as string | undefined;
    const sort = req.query.sort as string | undefined;
    const order = req.query.order as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(
      await searchStackOverflowQuestions(query, {
        tagged,
        sort: sort as "activity" | "votes" | "creation" | "hot" | "week" | "month" | undefined,
        order: order as "asc" | "desc" | undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
    );
  }),
);
// ─── Patent Search (USPTO) ─────────────────────────────────────────
import { searchPatents } from "../fetchers/knowledge/PatentFetcher.ts";

router.get(
  "/patents/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const inventor = req.query.inventor as string | undefined;
    const assignee = req.query.assignee as string | undefined;
    const limit = req.query.limit as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(
      await searchPatents(query, {
        inventor,
        assignee,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
    );
  }),
);
export default router;

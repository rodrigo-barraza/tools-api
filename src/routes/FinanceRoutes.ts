import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam, toISODate } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
import {
  getCachedQuote,
  cacheQuote,
  getCachedProfile,
  cacheProfile,
  getMarketNews,
  getEarnings,
  getCachedRecommendation,
  cacheRecommendation,
  getCachedFinancials,
  cacheFinancials,
  getFinanceHealth as getHealth,
} from "../caches/FinnhubCache.ts";
import {
  getCachedFearGreed,
  isFearGreedStale,
  updateFearGreed,
  setFearGreedError,
  getFearGreedHealth,
} from "../caches/FearGreedCache.ts";
import {
  fetchStockQuote,
  fetchCompanyProfile,
  fetchCompanyNews,
  fetchRecommendationTrends,
  fetchBasicFinancials,
} from "../fetchers/finance/FinnhubFetcher.ts";
import {
  getSeriesInfo,
  getSeriesObservations,
  searchSeries,
  getKeyIndicators,
} from "../fetchers/finance/FredFetcher.ts";
import { fetchHistoricalPrices } from "../fetchers/finance/HistoricalPriceFetcher.ts";
import { computeTechnicalAnalysis } from "../fetchers/finance/TechnicalAnalysisFetcher.ts";
import { fetchVolatilitySnapshot } from "../fetchers/finance/VolatilityFetcher.ts";
import { fetchFearGreedIndex } from "../fetchers/finance/FearGreedFetcher.ts";
import {
  fetchSecFilings,
  searchSecFilers,
  fetchCompanyFactsXbrl,
} from "../fetchers/finance/SecEdgarFetcher.ts";
import { fetchSectorPerformance } from "../fetchers/finance/SectorPerformanceFetcher.ts";
import { errorMessage } from "../utilities.ts";

const router = Router();
// ─── Stock Quote (on-demand with 1-min TTL cache) ──────────────────
router.get(
  "/quote/:symbol",
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const cached = getCachedQuote(symbol);
    if (cached) {
      res.json({ symbol, ...cached, cached: true });
      return;
    }
    const quote = await fetchStockQuote(symbol);
    cacheQuote(symbol, quote);
    return { symbol, ...quote, cached: false };
  }, "Stock quote"),
);
// ─── Company Profile (on-demand with 24h TTL cache) ────────────────
router.get(
  "/profile/:symbol",
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const cached = getCachedProfile(symbol);
    if (cached) {
      res.json(cached);
      return;
    }
    const profile = await fetchCompanyProfile(symbol);
    cacheProfile(symbol, profile);
    return profile;
  }, "Company profile"),
);
// ─── News (general = cached poll, company-specific = on-demand) ────
router.get(
  "/news",
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = req.query.symbol as string;
    if (symbol) {
      try {
        const now = new Date();
        const toDate = toISODate(now);
        const fromDate = toISODate(new Date(now.getTime() - 7 * 86_400_000));
        const news = await fetchCompanyNews(
          symbol.toUpperCase(),
          fromDate,
          toDate,
        );
        return res.json({
          symbol: symbol.toUpperCase(),
          count: news.length,
          articles: news.slice(0, 50),
        });
      } catch (error: unknown) {
        return res
          .status(502)
          .json({
            error: `Failed to fetch company news: ${errorMessage(error)}`,
          });
      }
    }
    const articles = getMarketNews();
    res.json({ count: articles.length, articles });
  }),
);
// ─── Earnings Calendar (cached poll) ───────────────────────────────
router.get("/earnings", (_req: Request, res: Response) => {
  const earnings = getEarnings();
  res.json({ count: earnings.length, earnings });
});
// ─── Analyst Recommendations (on-demand with 1h TTL cache) ─────────
router.get(
  "/recommendation/:symbol",
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const cached = getCachedRecommendation(symbol);
    if (cached) {
      res.json(cached);
      return;
    }
    const data = await fetchRecommendationTrends(symbol);
    cacheRecommendation(symbol, data);
    return data;
  }, "Analyst recommendations"),
);
// ─── Basic Financials (on-demand with 1h TTL cache) ────────────────
router.get(
  "/financials/:symbol",
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const cached = getCachedFinancials(symbol);
    if (cached) {
      res.json(cached);
      return;
    }
    const data = await fetchBasicFinancials(symbol);
    cacheFinancials(symbol, data);
    return data;
  }, "Basic financials"),
);
// ─── Macroeconomics (FRED) ─────────────────────────────────────────
router.get(
  "/macro/indicators",
  asyncHandler(() => getKeyIndicators(), "Key indicators fetch"),
);
router.get(
  "/macro/search",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      q: query,
      limit,
      orderBy,
    } = req.query as Record<string, string | undefined>;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    res.json(
      await searchSeries(query, {
        limit: parseInt(limit || "", 10) || 10,
        orderBy,
      }),
    );
  }),
);
router.get(
  "/macro/series/:seriesId/observations",
  asyncHandler((req: Request) => {
    const { limit, sortOrder, observationStart, observationEnd } =
      req.query as Record<string, string | undefined>;
    return getSeriesObservations(req.params.seriesId as string, {
      limit: parseInt(limit || "", 10) || 50,
      sortOrder,
      observationStart,
      observationEnd,
    });
  }, "Series observations fetch"),
);
router.get(
  "/macro/series/:seriesId",
  asyncHandler(
    (req: Request) => getSeriesInfo(req.params.seriesId as string),
    "Series info fetch",
  ),
);
// ─── Historical Prices (OHLCV Candles) ────────────────────────────
router.get(
  "/prices/:symbol",
  asyncHandler(async (req: Request) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const interval = (req.query.interval as string) || "1d";
    const period = (req.query.period as string) || "3mo";
    return fetchHistoricalPrices(symbol, {
      interval: interval as "1d",
      period: period as "3mo",
    });
  }, "Historical prices"),
);
// ─── Technical Analysis ───────────────────────────────────────────
router.get(
  "/technical/:symbol",
  asyncHandler(async (req: Request) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const indicators = req.query.indicators
      ? (req.query.indicators as string).split(",")
      : undefined;
    const period = req.query.period
      ? parseInt(req.query.period as string, 10)
      : undefined;
    const interval = (req.query.interval as string) || "1d";
    return computeTechnicalAnalysis(symbol, {
      indicators,
      period,
      interval: interval as "1d",
    });
  }, "Technical analysis"),
);
// ─── Volatility Dashboard ─────────────────────────────────────────
router.get(
  "/volatility",
  asyncHandler(() => fetchVolatilitySnapshot(), "Volatility snapshot"),
);
// ─── Fear & Greed Index ───────────────────────────────────────────
router.get(
  "/fear-greed",
  asyncHandler(async (req: Request) => {
    const limit = parseIntParam(req.query.limit as string, 30);
    const cached = getCachedFearGreed();
    if (!isFearGreedStale() && cached.current) {
      return {
        ...cached,
        cached: true,
        history: cached.history.slice(0, limit),
      };
    }
    try {
      const result = await fetchFearGreedIndex(limit);
      updateFearGreed(result.current, result.history);
      return { ...result, cached: false };
    } catch (error: unknown) {
      setFearGreedError({ message: errorMessage(error) });
      if (cached.current) {
        return {
          ...cached,
          cached: true,
          stale: true,
          history: cached.history.slice(0, limit),
        };
      }
      throw error;
    }
  }, "Fear & Greed index"),
);
// ─── SEC EDGAR Filings ────────────────────────────────────────────
router.get(
  "/sec/filings/:cik",
  asyncHandler(async (req: Request) => {
    const cik = req.params.cik as string;
    const filingType = req.query.filingType as string | undefined;
    const limit = parseIntParam(req.query.limit as string, 20);
    return fetchSecFilings(cik, filingType, limit);
  }, "SEC filings"),
);
router.get(
  "/sec/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const limit = parseIntParam(req.query.limit as string, 10);
    return searchSecFilers(query, limit);
  }, "SEC filer search"),
);
router.get(
  "/sec/facts/:cik",
  asyncHandler(async (req: Request) => {
    return fetchCompanyFactsXbrl(req.params.cik as string);
  }, "SEC XBRL facts"),
);
// ─── Sector Performance ──────────────────────────────────────────
router.get(
  "/sectors",
  asyncHandler(() => fetchSectorPerformance(), "Sector performance"),
);
// ─── Health ────────────────────────────────────────────────────────
export function getFinanceHealth() {
  const health = getHealth();
  return {
    ...health,
    fred: "on-demand",
    fearGreed: getFearGreedHealth(),
    volatility: "on-demand",
    technicalAnalysis: "on-demand",
    historicalPrices: "on-demand",
    secEdgar: "on-demand",
    sectorPerformance: "on-demand",
  };
}
// ── Unified Stock Data Dispatcher ──────────────────────────────────
router.get(
  "/stock/data",
  asyncHandler(async (req: Request, res: Response) => {
    const { action, symbol } = req.query as Record<string, string | undefined>;
    if (!action || !symbol)
      return res
        .status(400)
        .json({
          error: "'action' and 'symbol' are required",
          actions: ["quote", "profile", "recommendation", "financials"],
        });
    const pathMap: Record<string, string> = {
      quote: `/quote/${symbol}`,
      profile: `/profile/${symbol}`,
      recommendation: `/recommendation/${symbol}`,
      financials: `/financials/${symbol}`,
    };
    if (!action || !pathMap[action])
      return res
        .status(400)
        .json({
          error: `Unknown action: ${action}`,
          actions: Object.keys(pathMap),
        });
    // Internal redirect: re-use existing routes by forwarding the request
    req.url = pathMap[action];
    req.params.symbol = symbol;
    return router.handle(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
// ── Unified Macro Data Dispatcher ──────────────────────────────────
router.get(
  "/macro/data",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      action,
      q: searchQuery,
      seriesId,
      limit,
      orderBy,
      sortOrder,
      observationStart,
      observationEnd,
    } = req.query as Record<string, string | undefined>;
    if (!action)
      return res
        .status(400)
        .json({
          error: "'action' is required",
          actions: ["indicators", "search", "series", "observations"],
        });
    const pathMap: Record<string, string> = {
      indicators: "/macro/indicators",
      search: `/macro/search?q=${searchQuery || ""}&limit=${limit || 10}&orderBy=${orderBy || ""}`,
      series: `/macro/series/${seriesId || "GDP"}`,
      observations: `/macro/series/${seriesId || "GDP"}/observations?limit=${limit || 10}&sortOrder=${sortOrder || "desc"}&observationStart=${observationStart || ""}&observationEnd=${observationEnd || ""}`,
    };
    if (!action || !pathMap[action])
      return res
        .status(400)
        .json({
          error: `Unknown action: ${action}`,
          actions: Object.keys(pathMap),
        });
    req.url = pathMap[action];
    if (seriesId) req.params.seriesId = seriesId;
    return router.handle(req, res, () =>
      res.status(404).json({ error: "Route not found" }),
    );
  }),
);
export default router;

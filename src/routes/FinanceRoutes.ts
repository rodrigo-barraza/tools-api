import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { toISODate } from "@rodrigo-barraza/utilities-library";
import { Router } from "express";
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
const router = Router();
// ─── Stock Quote (on-demand with 1-min TTL cache) ──────────────────
router.get("/quote/:symbol", asyncHandler(async (req: any, res: any) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const cached = getCachedQuote(symbol);
  if (cached) {
    res.json({ symbol, ...cached, cached: true });
    return;
  }
  const quote = await fetchStockQuote(symbol);
  cacheQuote(symbol, quote);
  return { symbol, ...quote, cached: false };
}, "Stock quote"));
// ─── Company Profile (on-demand with 24h TTL cache) ────────────────
router.get("/profile/:symbol", asyncHandler(async (req: any, res: any) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const cached = getCachedProfile(symbol);
  if (cached) {
    res.json(cached);
    return;
  }
  const profile = await fetchCompanyProfile(symbol);
  cacheProfile(symbol, profile);
  return profile;
}, "Company profile"));
// ─── News (general = cached poll, company-specific = on-demand) ────
router.get("/news", asyncHandler(async (req: any, res: any) => {
  const symbol = req.query.symbol as string;
  if (symbol) {
    try {
      const now = new Date();
      const to = toISODate(now);
      const from = toISODate(new Date(now.getTime() - 7 * 86_400_000));
      const news = await fetchCompanyNews(symbol.toUpperCase(), from, to);
      return res.json({
        symbol: symbol.toUpperCase(),
        count: news.length,
        articles: news.slice(0, 50),
      });
    } catch (error: any) {
      return res
        .status(502)
        .json({ error: `Failed to fetch company news: ${error.message}` });
    }
  }
  const articles = getMarketNews();
  res.json({ count: articles.length, articles });
}));
// ─── Earnings Calendar (cached poll) ───────────────────────────────
router.get("/earnings", (_req: any, res: any) => {
  const earnings = getEarnings();
  res.json({ count: earnings.length, earnings });
});
// ─── Analyst Recommendations (on-demand with 1h TTL cache) ─────────
router.get("/recommendation/:symbol", asyncHandler(async (req: any, res: any) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const cached = getCachedRecommendation(symbol);
  if (cached) {
    res.json(cached);
    return;
  }
  const data = await fetchRecommendationTrends(symbol);
  cacheRecommendation(symbol, data);
  return data;
}, "Analyst recommendations"));
// ─── Basic Financials (on-demand with 1h TTL cache) ────────────────
router.get("/financials/:symbol", asyncHandler(async (req: any, res: any) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const cached = getCachedFinancials(symbol);
  if (cached) {
    res.json(cached);
    return;
  }
  const data = await fetchBasicFinancials(symbol);
  cacheFinancials(symbol, data);
  return data;
}, "Basic financials"));
// ─── Macroeconomics (FRED) ─────────────────────────────────────────
router.get("/macro/indicators", asyncHandler(
  () => getKeyIndicators(),
  "Key indicators fetch",
));
router.get("/macro/search", asyncHandler(async (req: any, res: any) => {
  const { q, limit, orderBy } = req.query as any;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(await searchSeries(q, {
    limit: parseInt(limit, 10) || 10,
    orderBy,
  }));
}));
router.get("/macro/series/:seriesId/observations", asyncHandler(
  (req: any) => {
    const { limit, sortOrder, observationStart, observationEnd } = req.query as any;
    return getSeriesObservations(req.params.seriesId as string, {
      limit: parseInt(limit, 10) || 50,
      sortOrder,
      observationStart,
      observationEnd,
    });
  },
  "Series observations fetch",
));
router.get("/macro/series/:seriesId", asyncHandler(
  (req: any) => getSeriesInfo(req.params.seriesId as string),
  "Series info fetch",
));
// ─── Health ────────────────────────────────────────────────────────
export function getFinanceHealth() {
  const health = getHealth();
  (health as any).fred = "on-demand";
  return health;
}
// ── Unified Stock Data Dispatcher ──────────────────────────────────
router.get("/stock/data", asyncHandler(async (req: any, res: any) => {
  const { action, symbol } = req.query as any;
  if (!action || !symbol) return res.status(400).json({ error: "'action' and 'symbol' are required", actions: ["quote", "profile", "recommendation", "financials"] });
  const pathMap = {
    quote: `/quote/${symbol}`,
    profile: `/profile/${symbol}`,
    recommendation: `/recommendation/${symbol}`,
    financials: `/financials/${symbol}`,
  };
  // @ts-expect-error - TS7053: implicit any index
  if (!pathMap[action]) return res.status(400).json({ error: `Unknown action: ${action}`, actions: Object.keys(pathMap) });
  // Internal redirect: re-use existing routes by forwarding the request
  // @ts-expect-error - TS7053: implicit any index
  req.url = pathMap[action];
  req.params.symbol = symbol;
  return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
}));
// ── Unified Macro Data Dispatcher ──────────────────────────────────
router.get("/macro/data", asyncHandler(async (req: any, res: any) => {
  const { action, q, seriesId, limit, orderBy, sortOrder, observationStart, observationEnd } = req.query as any;
  if (!action) return res.status(400).json({ error: "'action' is required", actions: ["indicators", "search", "series", "observations"] });
  const pathMap = {
    indicators: "/macro/indicators",
    search: `/macro/search?q=${q || ""}&limit=${limit || 10}&orderBy=${orderBy || ""}`,
    series: `/macro/series/${seriesId || "GDP"}`,
    observations: `/macro/series/${seriesId || "GDP"}/observations?limit=${limit || 10}&sortOrder=${sortOrder || "desc"}&observationStart=${observationStart || ""}&observationEnd=${observationEnd || ""}`,
  };
  // @ts-expect-error - TS7053: implicit any index
  if (!pathMap[action]) return res.status(400).json({ error: `Unknown action: ${action}`, actions: Object.keys(pathMap) });
  // @ts-expect-error - TS7053: implicit any index
  req.url = pathMap[action];
  if (seriesId) req.params.seriesId = seriesId;
  return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
}));
export default router;

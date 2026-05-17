import { toISODate } from "@rodrigo-barraza/utilities-library";
import {
  FINNHUB_NEWS_INTERVAL_MS,
  FINNHUB_EARNINGS_INTERVAL_MS,
} from "../constants.ts";
import {
  fetchMarketNews,
  fetchEarningsCalendar,
} from "../fetchers/finance/FinnhubFetcher.ts";
import {
  updateMarketNews,
  setNewsError,
  updateEarnings,
  setEarningsError,
} from "../caches/FinnhubCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import logger from "../logger.ts";
// ─── News Collector ────────────────────────────────────────────────
async function collectMarketNews() {
  try {
    const articles = await fetchMarketNews("general");
    const sliced = Array.isArray(articles) ? articles.slice(0, 50) : [];
    updateMarketNews(sliced);
    await saveState("market_news", sliced);
    logger.info(`[Finnhub/News] ✅ ${sliced.length} articles`);
  } catch (error) {
    setNewsError(error);
    logger.error(`[Finnhub/News] ❌ ${error.message}`);
  }
}
// ─── Earnings Calendar Collector ───────────────────────────────────
async function collectEarnings() {
  try {
    const now = new Date();
    const from = toISODate(now);
    const to = toISODate(new Date(now.getTime() + 14 * 86_400_000));
    const result = await fetchEarningsCalendar(from, to);
    const earnings = result?.earningsCalendar || [];
    updateEarnings(earnings);
    await saveState("earnings_calendar", earnings);
    logger.info(
      `[Finnhub/Earnings] ✅ ${earnings.length} upcoming (${from} → ${to})`,
    );
  } catch (error) {
    setEarningsError(error);
    logger.error(`[Finnhub/Earnings] ❌ ${error.message}`);
  }
}
// ─── Startup Definitions ──────────────────────────────────────────
const STARTUP_TASKS = [
  {
    label: "Finnhub/News",
    collection: "market_news",
    ttl: FINNHUB_NEWS_INTERVAL_MS,
    collectFn: collectMarketNews,
    restoreFn: updateMarketNews,
    delay: 0,
  },
  {
    label: "Finnhub/Earnings",
    collection: "earnings_calendar",
    ttl: FINNHUB_EARNINGS_INTERVAL_MS,
    collectFn: collectEarnings,
    restoreFn: updateEarnings,
    delay: 2_000,
  },
];
// ─── Start Finance Collectors ──────────────────────────────────────
export function startFinanceCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("📈 Finance collectors started (Finnhub — on-demand quotes)");
}

import { COMMODITIES_INTERVAL_MS } from "../constants.ts";
import { fetchCommodities } from "../fetchers/market/CommodityFetcher.ts";
import {
  updateCommodities,
  setCommodityError,
  restoreCommodities,
} from "../caches/CommodityCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

type FetchResult = Awaited<ReturnType<typeof fetchCommodities>>;
type QuoteItem = FetchResult[number];

async function collectCommodities() {
  try {
    const quotes = await fetchCommodities();
    const result = await updateCommodities(quotes as Parameters<typeof updateCommodities>[0]);
    await saveState("commodities", quotes);

    const topMover = [...quotes]
      .filter((q: QuoteItem) => q.changePercent != null)
      .sort((a: QuoteItem, b: QuoteItem) => Math.abs(a.changePercent ?? 0) - Math.abs(b.changePercent ?? 0))
      .at(-1);

    logger.info(
      `[Commodities] ✅ ${quotes.length} tickers | ` +
        `${result?.inserted || 0} snapshots saved | ` +
        `Top mover: ${topMover?.name ?? "?"} (${(topMover?.changePercent ?? 0) >= 0 ? "+" : ""}${topMover?.changePercent ?? "?"}%)`,
    );
  } catch (error: unknown) {
    setCommodityError({ message: errorMessage(error) });
    logger.error(`[Commodities] ❌ ${errorMessage(error)}`);
  }
}

const STARTUP_TASKS = [
  {
    label: "Commodities",
    collection: "commodities",
    ttl: COMMODITIES_INTERVAL_MS,
    collectFn: collectCommodities,
    restoreFn: restoreCommodities,
    delay: 0,
  },
];

export function startMarketCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("💰 Market collectors started");
}

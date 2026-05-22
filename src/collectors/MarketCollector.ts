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

async function collectCommodities() {
  try {
    const quotes = await fetchCommodities();
    const result = await updateCommodities(quotes);
    await saveState("commodities", quotes);

    const topMover = [...quotes]
      .filter((q: any) => q.changePercent != null)
      .sort((a: any, b: any) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];

    logger.info(
      `[Commodities] ✅ ${quotes.length} tickers | ` +
        `${result?.inserted || 0} snapshots saved | ` +
        `Top mover: ${topMover?.name ?? "?"} (${topMover?.changePercent >= 0 ? "+" : ""}${topMover?.changePercent ?? "?"}%)`,
    );
  } catch (error: unknown) {
    setCommodityError(error as any);
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

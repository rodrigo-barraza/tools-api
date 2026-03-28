import { COMMODITIES_INTERVAL_MS } from "../constants.js";
import { fetchCommodities } from "../fetchers/market/CommodityFetcher.js";
import {
  updateCommodities,
  setCommodityError,
  restoreCommodities,
} from "../caches/CommodityCache.js";
import { saveState, startCollectorLoop } from "../services/FreshnessService.js";

async function collectCommodities() {
  try {
    const quotes = await fetchCommodities();
    const result = await updateCommodities(quotes);
    await saveState("commodities", quotes);

    const topMover = [...quotes]
      .filter((q) => q.changePercent != null)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];

    console.log(
      `[Commodities] ✅ ${quotes.length} tickers | ` +
        `${result?.inserted || 0} snapshots saved | ` +
        `Top mover: ${topMover?.name ?? "?"} (${topMover?.changePercent >= 0 ? "+" : ""}${topMover?.changePercent ?? "?"}%)`,
    );
  } catch (error) {
    setCommodityError(error);
    console.error(`[Commodities] ❌ ${error.message}`);
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
  console.log("💰 Market collectors started");
}

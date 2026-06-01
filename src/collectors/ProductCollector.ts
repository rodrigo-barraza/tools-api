import {
  BESTBUY_INTERVAL_MS,
  AMAZON_INTERVAL_MS,
  PRODUCTHUNT_PRODUCT_INTERVAL_MS,
  EBAY_INTERVAL_MS,
  ETSY_INTERVAL_MS,
  BESTBUY_CA_AVAILABILITY_INTERVAL_MS,
  COSTCO_INTERVAL_MS,
  PRODUCT_SOURCES,
} from "../constants.ts";
import { upsertProducts } from "../models/Product.ts";
import { fetchAllBestBuyTrending } from "../fetchers/product/BestBuyFetcher.ts";
import { fetchAllAmazonBestSellers } from "../fetchers/product/AmazonFetcher.ts";
import { fetchProductHuntTrending } from "../fetchers/product/ProductHuntFetcher.ts";
import { fetchAllEbayTrending } from "../fetchers/product/EbayFetcher.ts";
import { fetchEtsyTrending } from "../fetchers/product/EtsyFetcher.ts";
import { fetchBestBuyCAAvailability } from "../fetchers/product/BestBuyCAAvailabilityFetcher.ts";
import {
  fetchAllCostcoUS,
  fetchAllCostcoCA,
} from "../fetchers/product/CostcoFetcher.ts";
import {
  updateProducts,
  setProductError,
  type Product,
} from "../caches/ProductCache.ts";
import {
  getWatchedSkus,
  getWatchlistMetadata,
  updateStatuses,
  setAvailabilityError,
} from "../caches/BestBuyCAAvailabilityCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import { disableToolRuntime } from "../services/ToolSchemaService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ─── Collector Factory ─────────────────────────────────────────────
function createProductCollector<T>(
  collection: string,
  source: string,
  fetchFn: () => Promise<T[]>,
) {
  return async function () {
    try {
      const products = await fetchFn();
      updateProducts(source, products as unknown as Product[]);
      const result = await upsertProducts(
        products as unknown as Parameters<typeof upsertProducts>[0],
      );
      await saveState(collection, { source, products });
      logger.info(
        `[${collection}] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
      );
    } catch (error: unknown) {
      setProductError(source, new Error(errorMessage(error)));
      logger.error(`[${collection}] ❌ ${errorMessage(error)}`);
    }
  };
}

// ─── Collectors ────────────────────────────────────────────────────

const collectBestBuy = createProductCollector(
  "products_bestbuy",
  PRODUCT_SOURCES.BESTBUY,
  fetchAllBestBuyTrending,
);
const collectAmazon = createProductCollector(
  "products_amazon",
  PRODUCT_SOURCES.AMAZON,
  fetchAllAmazonBestSellers,
);
const collectProductHunt = createProductCollector(
  "products_producthunt",
  PRODUCT_SOURCES.PRODUCTHUNT,
  fetchProductHuntTrending,
);
const collectEbay = createProductCollector(
  "products_ebay",
  PRODUCT_SOURCES.EBAY,
  fetchAllEbayTrending,
);
const collectEtsy = createProductCollector(
  "products_etsy",
  PRODUCT_SOURCES.ETSY,
  fetchEtsyTrending,
);
const collectCostcoUS = createProductCollector(
  "products_costco_us",
  PRODUCT_SOURCES.COSTCO_US,
  async () => {
    const products = await fetchAllCostcoUS();
    if (products.length === 0) {
      disableToolRuntime(
        "get_costco_us_products",
        "All Costco US categories blocked (bot detection / 403)",
      );
    }
    return products;
  },
);
const collectCostcoCA = createProductCollector(
  "products_costco_ca",
  PRODUCT_SOURCES.COSTCO_CA,
  async () => {
    const products = await fetchAllCostcoCA();
    if (products.length === 0) {
      disableToolRuntime(
        "get_costco_ca_products",
        "All Costco CA categories blocked (bot detection / 403)",
      );
    }
    return products;
  },
);

// BestBuy CA Availability
async function collectBestBuyCAAvailability() {
  try {
    const skus = getWatchedSkus();
    if (!skus.length) return;
    const metadata = getWatchlistMetadata();
    const { results, errors } = await fetchBestBuyCAAvailability(
      skus,
      metadata,
    );
    updateStatuses(results as Parameters<typeof updateStatuses>[0]);
    await saveState("bestbuy_ca_availability", results);
    const inStock = (results as { inStock: boolean }[]).filter(
      (r) => r.inStock,
    ).length;
    logger.info(
      `[bestbuy_ca_availability] ✅ ${results.length} SKUs checked | ${inStock} in stock`,
    );
    if (errors.length) {
      logger.warn(
        `[bestbuy_ca_availability] ⚠️ ${errors.length} batch error(s): ${errors[0]}`,
      );
    }
  } catch (error: unknown) {
    setAvailabilityError({ message: errorMessage(error) });
    logger.error(`[bestbuy_ca_availability] ❌ ${errorMessage(error)}`);
  }
}

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  {
    label: "BestBuy",
    collection: "products_bestbuy",
    ttl: BESTBUY_INTERVAL_MS,
    collectFn: collectBestBuy,
    delay: 0,
  },
  {
    label: "Amazon",
    collection: "products_amazon",
    ttl: AMAZON_INTERVAL_MS,
    collectFn: collectAmazon,
    delay: 15_000,
  },
  {
    label: "ProductHunt",
    collection: "products_producthunt",
    ttl: PRODUCTHUNT_PRODUCT_INTERVAL_MS,
    collectFn: collectProductHunt,
    delay: 20_000,
  },
  {
    label: "eBay",
    collection: "products_ebay",
    ttl: EBAY_INTERVAL_MS,
    collectFn: collectEbay,
    delay: 25_000,
  },
  {
    label: "Etsy",
    collection: "products_etsy",
    ttl: ETSY_INTERVAL_MS,
    collectFn: collectEtsy,
    delay: 30_000,
  },
  {
    label: "BestBuy CA",
    collection: "bestbuy_ca_availability",
    ttl: BESTBUY_CA_AVAILABILITY_INTERVAL_MS,
    collectFn: collectBestBuyCAAvailability,
    restoreFn: updateStatuses,
    delay: 35_000,
  },
  {
    label: "Costco US",
    collection: "products_costco_us",
    ttl: COSTCO_INTERVAL_MS,
    collectFn: collectCostcoUS,
    delay: 40_000,
  },
  {
    label: "Costco CA",
    collection: "products_costco_ca",
    ttl: COSTCO_INTERVAL_MS,
    collectFn: collectCostcoCA,
    delay: 45_000,
  },
];

export function startProductCollectors() {
  // Set default restoreFn for standard product tasks
  const tasks = STARTUP_TASKS.map((task) => ({
    ...task,
    restoreFn:
      task.restoreFn ||
      ((data: Record<string, unknown>) =>
        updateProducts(
          data.source as string,
          data.products as Parameters<typeof updateProducts>[1],
        )),
  }));

  startCollectorLoop(tasks);
  logger.info("📦 Product collectors started");
}

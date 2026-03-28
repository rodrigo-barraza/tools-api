import {
  BESTBUY_INTERVAL_MS,
  AMAZON_INTERVAL_MS,
  PRODUCTHUNT_PRODUCT_INTERVAL_MS,
  EBAY_INTERVAL_MS,
  ETSY_INTERVAL_MS,
  BESTBUY_CA_AVAILABILITY_INTERVAL_MS,
  COSTCO_INTERVAL_MS,
  PRODUCT_SOURCES,
} from "../constants.js";
import { upsertProducts } from "../models/Product.js";
import { fetchAllBestBuyTrending } from "../fetchers/product/BestBuyFetcher.js";
import { fetchAllAmazonBestSellers } from "../fetchers/product/AmazonFetcher.js";
import { fetchProductHuntTrending } from "../fetchers/product/ProductHuntFetcher.js";
import { fetchAllEbayTrending } from "../fetchers/product/EbayFetcher.js";
import { fetchEtsyTrending } from "../fetchers/product/EtsyFetcher.js";
import { fetchBestBuyCAAvailability } from "../fetchers/product/BestBuyCAAvailabilityFetcher.js";
import {
  fetchAllCostcoUS,
  fetchAllCostcoCA,
} from "../fetchers/product/CostcoFetcher.js";
import { updateProducts, setProductError } from "../caches/ProductCache.js";
import {
  getWatchedSkus,
  getWatchlistMetadata,
  updateStatuses,
  setAvailabilityError,
} from "../caches/BestBuyCAAvailabilityCache.js";
import { saveState, startCollectorLoop } from "../services/FreshnessService.js";

// ─── Collector Factory ─────────────────────────────────────────────

function createProductCollector(collection, source, fetchFn) {
  return async function () {
    try {
      const products = await fetchFn();
      updateProducts(source, products);
      const result = await upsertProducts(products);
      await saveState(collection, { source, products });
      console.log(
        `[${collection}] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
      );
    } catch (error) {
      setProductError(source, error);
      console.error(`[${collection}] ❌ ${error.message}`);
    }
  };
}

// ─── Collectors ────────────────────────────────────────────────────

const collectBestBuy = createProductCollector("products_bestbuy", PRODUCT_SOURCES.BESTBUY, fetchAllBestBuyTrending);
const collectAmazon = createProductCollector("products_amazon", PRODUCT_SOURCES.AMAZON, fetchAllAmazonBestSellers);
const collectProductHunt = createProductCollector("products_producthunt", PRODUCT_SOURCES.PRODUCTHUNT, fetchProductHuntTrending);
const collectEbay = createProductCollector("products_ebay", PRODUCT_SOURCES.EBAY, fetchAllEbayTrending);
const collectEtsy = createProductCollector("products_etsy", PRODUCT_SOURCES.ETSY, fetchEtsyTrending);
const collectCostcoUS = createProductCollector("products_costco_us", PRODUCT_SOURCES.COSTCO_US, fetchAllCostcoUS);
const collectCostcoCA = createProductCollector("products_costco_ca", PRODUCT_SOURCES.COSTCO_CA, fetchAllCostcoCA);

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
    updateStatuses(results);
    await saveState("bestbuy_ca_availability", results);
    const inStock = results.filter((r) => r.inStock).length;
    console.log(
      `[bestbuy_ca_availability] ✅ ${results.length} SKUs checked | ${inStock} in stock`,
    );
    if (errors.length) {
      console.warn(
        `[bestbuy_ca_availability] ⚠️ ${errors.length} batch error(s): ${errors[0]}`,
      );
    }
  } catch (error) {
    setAvailabilityError(error);
    console.error(`[bestbuy_ca_availability] ❌ ${error.message}`);
  }
}

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  { label: "BestBuy", collection: "products_bestbuy", ttl: BESTBUY_INTERVAL_MS, collectFn: collectBestBuy, delay: 0 },
  { label: "Amazon", collection: "products_amazon", ttl: AMAZON_INTERVAL_MS, collectFn: collectAmazon, delay: 15_000 },
  { label: "ProductHunt", collection: "products_producthunt", ttl: PRODUCTHUNT_PRODUCT_INTERVAL_MS, collectFn: collectProductHunt, delay: 20_000 },
  { label: "eBay", collection: "products_ebay", ttl: EBAY_INTERVAL_MS, collectFn: collectEbay, delay: 25_000 },
  { label: "Etsy", collection: "products_etsy", ttl: ETSY_INTERVAL_MS, collectFn: collectEtsy, delay: 30_000 },
  { label: "BestBuy CA", collection: "bestbuy_ca_availability", ttl: BESTBUY_CA_AVAILABILITY_INTERVAL_MS, collectFn: collectBestBuyCAAvailability, restoreFn: updateStatuses, delay: 35_000 },
  { label: "Costco US", collection: "products_costco_us", ttl: COSTCO_INTERVAL_MS, collectFn: collectCostcoUS, delay: 40_000 },
  { label: "Costco CA", collection: "products_costco_ca", ttl: COSTCO_INTERVAL_MS, collectFn: collectCostcoCA, delay: 45_000 },
];

export function startProductCollectors() {
  // Set default restoreFn for standard product tasks
  const tasks = STARTUP_TASKS.map((task) => ({
    ...task,
    restoreFn:
      task.restoreFn ||
      ((data) => updateProducts(data.source, data.products)),
  }));

  startCollectorLoop(tasks);
  console.log("📦 Product collectors started");
}

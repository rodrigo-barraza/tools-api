import {
  BESTBUY_INTERVAL_MS,
  AMAZON_INTERVAL_MS,
  PRODUCTHUNT_PRODUCT_INTERVAL_MS,
  EBAY_INTERVAL_MS,
  ETSY_INTERVAL_MS,
} from "../constants.js";
import { upsertProducts } from "../models/Product.js";
import { fetchAllBestBuyTrending } from "../fetchers/product/BestBuyFetcher.js";
import { fetchAllAmazonBestSellers } from "../fetchers/product/AmazonFetcher.js";
import { fetchProductHuntTrending } from "../fetchers/product/ProductHuntFetcher.js";
import { fetchAllEbayTrending } from "../fetchers/product/EbayFetcher.js";
import { fetchEtsyTrending } from "../fetchers/product/EtsyFetcher.js";
import { updateProducts, setProductError } from "../caches/ProductCache.js";

async function collectBestBuy() {
  try {
    const products = await fetchAllBestBuyTrending();
    updateProducts("bestbuy", products);
    const result = await upsertProducts(products);
    console.log(
      `[BestBuy] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setProductError("bestbuy", error);
    console.error(`[BestBuy] ❌ ${error.message}`);
  }
}

async function collectAmazon() {
  try {
    const products = await fetchAllAmazonBestSellers();
    updateProducts("amazon", products);
    const result = await upsertProducts(products);
    console.log(
      `[Amazon] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setProductError("amazon", error);
    console.error(`[Amazon] ❌ ${error.message}`);
  }
}

async function collectProductHunt() {
  try {
    const products = await fetchProductHuntTrending();
    updateProducts("producthunt", products);
    const result = await upsertProducts(products);
    console.log(
      `[ProductHunt] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setProductError("producthunt", error);
    console.error(`[ProductHunt] ❌ ${error.message}`);
  }
}

async function collectEbay() {
  try {
    const products = await fetchAllEbayTrending();
    updateProducts("ebay", products);
    const result = await upsertProducts(products);
    console.log(
      `[eBay] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setProductError("ebay", error);
    console.error(`[eBay] ❌ ${error.message}`);
  }
}

async function collectEtsy() {
  try {
    const products = await fetchEtsyTrending();
    updateProducts("etsy", products);
    const result = await upsertProducts(products);
    console.log(
      `[Etsy] ✅ ${products.length} products | ${result.upserted} new, ${result.modified} updated`,
    );
  } catch (error) {
    setProductError("etsy", error);
    console.error(`[Etsy] ❌ ${error.message}`);
  }
}

export function startProductCollectors() {
  collectBestBuy();
  setTimeout(collectAmazon, 15_000);
  setTimeout(collectProductHunt, 20_000);
  setTimeout(collectEbay, 25_000);
  setTimeout(collectEtsy, 30_000);

  setInterval(collectBestBuy, BESTBUY_INTERVAL_MS);
  setInterval(collectAmazon, AMAZON_INTERVAL_MS);
  setInterval(collectProductHunt, PRODUCTHUNT_PRODUCT_INTERVAL_MS);
  setInterval(collectEbay, EBAY_INTERVAL_MS);
  setInterval(collectEtsy, ETSY_INTERVAL_MS);

  console.log("📦 Product collectors started");
}

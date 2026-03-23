import CONFIG from "../../config.js";
import { BESTBUY_CATEGORIES, PRODUCT_SOURCES } from "../../constants.js";
import { computeTrendingScore, sleep } from "../../utilities.js";

const BASE_URL = "https://api.bestbuy.com/beta/products";
const BESTBUY_REQUEST_DELAY_MS = 1_000; // 1 second between requests

/**
 * Normalize a Best Buy product into the unified schema.
 */
function normalizeBestBuyProduct(
  item,
  rank,
  unifiedCategory,
  sourceCategoryName,
) {
  return {
    sourceId: String(item.sku),
    source: PRODUCT_SOURCES.BESTBUY,
    name: item.name,
    category: unifiedCategory,
    sourceCategory: sourceCategoryName,
    rank,
    price: item.regularPrice ?? item.salePrice ?? null,
    currency: "USD",
    rating: item.customerReviewAverage ?? null,
    reviewCount: item.customerReviewCount ?? null,
    imageUrl: item.image ?? item.largeFrontImage ?? null,
    productUrl: item.url
      ? `https://www.bestbuy.com${item.url}`
      : `https://www.bestbuy.com/site/${item.sku}.p`,
    description: item.shortDescription ?? null,
    trendingScore: 0,
    fetchedAt: new Date(),
  };
}

/**
 * Fetch trending products from Best Buy (top 10 by customer views, rolling 3h window).
 * Optionally filter by category.
 */
export async function fetchBestBuyTrending(categoryId = null) {
  if (!CONFIG.BESTBUY_API_KEY) {
    throw new Error("BESTBUY_API_KEY not configured");
  }

  const endpoint = categoryId
    ? `${BASE_URL}/trendingViewed(categoryId=${categoryId})`
    : `${BASE_URL}/trendingViewed`;

  const url = `${endpoint}?apiKey=${CONFIG.BESTBUY_API_KEY}&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Best Buy API returned ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json();
  const items = data?.results || [];

  // Find the matching category mapping
  const catMapping = categoryId
    ? BESTBUY_CATEGORIES.find((c) => c.id === categoryId)
    : null;

  const products = items.map((item, index) => {
    const product = normalizeBestBuyProduct(
      item,
      index + 1,
      catMapping?.unified || "electronics",
      catMapping?.name || "All",
    );
    product.trendingScore = computeTrendingScore(product);
    return product;
  });

  return {
    source: PRODUCT_SOURCES.BESTBUY,
    category: catMapping?.name || "All",
    products,
    fetchedAt: new Date(),
  };
}

/**
 * Fetch trending products across all configured Best Buy categories.
 * Rate-limited to 1 req/sec to respect Best Buy's per-second limit.
 */
export async function fetchAllBestBuyTrending() {
  const allProducts = [];

  // Fetch general trending first
  try {
    const general = await fetchBestBuyTrending();
    allProducts.push(...general.products);
  } catch (error) {
    console.error(`[BestBuy] ❌ General trending: ${error.message}`);
  }

  // Fetch per-category trending with rate limiting
  for (const cat of BESTBUY_CATEGORIES) {
    await sleep(BESTBUY_REQUEST_DELAY_MS);
    try {
      const result = await fetchBestBuyTrending(cat.id);
      allProducts.push(...result.products);
    } catch (error) {
      console.error(`[BestBuy] ❌ ${cat.name}: ${error.message}`);
    }
  }

  return allProducts;
}

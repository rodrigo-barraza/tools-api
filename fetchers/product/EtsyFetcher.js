import CONFIG from "../../config.js";
import { PRODUCT_SOURCES } from "../../constants.js";
import { computeTrendingScore } from "../../utilities.js";

const BASE_URL = "https://openapi.etsy.com/v3/application";

/**
 * Etsy category mappings → unified categories.
 */
const ETSY_CATEGORY_MAP = {
  electronics_and_accessories: "electronics",
  computers_and_peripherals: "computers",
  video_games: "gaming",
  home_and_living: "home",
  kitchen_and_dining: "kitchen",
  clothing: "fashion",
  jewelry: "fashion",
  bath_and_beauty: "beauty",
  toys_and_games: "toys",
  books_movies_and_music: "books",
  sports_and_outdoors: "sports",
  craft_supplies_and_tools: "other",
  art_and_collectibles: "other",
  bags_and_purses: "fashion",
  shoes: "fashion",
  accessories: "fashion",
  pet_supplies: "other",
  weddings: "other",
};

/**
 * Map an Etsy taxonomy tag to a unified category.
 */
function mapEtsyCategory(tags) {
  if (!tags || !tags.length) return "other";
  for (const tag of tags) {
    const lower = tag.toLowerCase().replace(/\s+/g, "_");
    for (const [key, value] of Object.entries(ETSY_CATEGORY_MAP)) {
      if (lower.includes(key) || key.includes(lower)) return value;
    }
  }
  return "other";
}

/**
 * Fetch trending listings from Etsy using the Listings API.
 * Sorts by most recent with high views — Etsy doesn't have a
 * direct "trending" sort, so we use keyword + recency as a proxy.
 */
export async function fetchEtsyTrending() {
  if (!CONFIG.ETSY_API_KEY) {
    throw new Error("ETSY_API_KEY not configured");
  }

  const trendingKeywords = [
    "trending",
    "bestseller",
    "popular",
    "best seller",
    "most popular",
  ];

  const allProducts = [];

  for (const keyword of trendingKeywords) {
    try {
      const params = new URLSearchParams({
        keywords: keyword,
        limit: "25",
        sort_on: "score",
        sort_order: "desc",
      });

      const response = await fetch(`${BASE_URL}/listings/active?${params}`, {
        headers: {
          "x-api-key": CONFIG.ETSY_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Etsy API returned ${response.status}`);
      }

      const data = await response.json();
      const listings = data.results || [];

      const products = listings.map((item, index) => {
        const product = {
          sourceId: String(item.listing_id),
          source: PRODUCT_SOURCES.ETSY,
          name: item.title,
          category: mapEtsyCategory(item.tags || []),
          sourceCategory: item.taxonomy_path?.join(" > ") || "Etsy",
          rank: index + 1,
          price: item.price?.amount
            ? item.price.amount / item.price.divisor
            : null,
          currency: item.price?.currency_code || "USD",
          rating: null,
          reviewCount: item.num_favorers || 0,
          imageUrl: item.images?.[0]?.url_570xN || null,
          productUrl:
            item.url || `https://www.etsy.com/listing/${item.listing_id}`,
          description: item.description?.slice(0, 200) || null,
          trendingScore: 0,
          views: item.views || 0,
          fetchedAt: new Date(),
        };
        product.trendingScore = computeTrendingScore(product);
        return product;
      });

      allProducts.push(...products);
    } catch (error) {
      console.error(`[Etsy] ❌ "${keyword}": ${error.message}`);
    }
  }

  // Deduplicate by listing ID
  const seen = new Set();
  const unique = allProducts.filter((p) => {
    if (seen.has(p.sourceId)) return false;
    seen.add(p.sourceId);
    return true;
  });

  return unique;
}

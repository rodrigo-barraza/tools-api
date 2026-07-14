import CONFIG from "../../config.ts";
import { PRODUCT_SOURCES, ETSY_CATEGORY_MAP } from "../../constants.ts";
import { computeTrendingScore, errorMessage } from "../../utilities.ts";
import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
import type { ProductInput } from "../../models/Product.ts";

const BASE_URL = "https://openapi.etsy.com/v3/application";

interface EtsyPrice {
  amount: number;
  divisor: number;
  currency_code: string;
}

interface EtsyImage {
  url_570xN: string;
}

interface EtsyListing {
  listing_id: number;
  title: string;
  tags?: string[];
  taxonomy_path?: string[];
  price?: EtsyPrice;
  "num_favorers"?: number;
  images?: EtsyImage[];
  url?: string;
  description?: string;
  views?: number;
}

/**
 * Map an Etsy taxonomy tag to a unified category.
 */
function mapEtsyCategory(tags: string[]) {
  if (!tags || !tags.length) return "other";
  for (const tag of tags) {
    const lower = tag.toLowerCase().replace(/\s+/g, "_");
    for (const [key, value] of Object.entries(ETSY_CATEGORY_MAP)) {
      if (lower.includes(key) || key.includes(lower)) return value;
    }
  }
  return "other";
}

// ─── On-Demand Keyword Search ─────────────────────────────────────

const ETSY_SEARCH_SORTS = new Set(["score", "created", "price"]);

export interface EtsySearchOptions {
  limit?: number;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface EtsySearchResult {
  query: string;
  totalOnEtsy: number;
  listings: {
    listingId: string;
    title: string;
    price: number | null;
    currency: string | null;
    url: string;
    favorites: number;
    createdAt: string | null;
    description: string | null;
  }[];
}

interface EtsySearchListing extends EtsyListing {
  original_creation_timestamp?: number;
}

/**
 * Search active Etsy listings by keyword via the official v3 API.
 */
export async function searchEtsyListings(
  query: string,
  { limit = 20, sort = "score", minPrice, maxPrice }: EtsySearchOptions = {},
): Promise<EtsySearchResult | { error: string }> {
  if (!CONFIG.ETSY_API_KEY || !CONFIG.ETSY_SHARED_SECRET) {
    return { error: "ETSY_API_KEY and ETSY_SHARED_SECRET not configured" };
  }
  const trimmed = query.trim();
  if (!trimmed) return { error: "Query is required" };
  if (!ETSY_SEARCH_SORTS.has(sort)) {
    return {
      error: `Unknown sort '${sort}'. Use one of: ${[...ETSY_SEARCH_SORTS].join(", ")}`,
    };
  }

  const params = new URLSearchParams({
    keywords: trimmed,
    limit: String(Math.min(Math.max(limit, 1), 50)),
    sort_on: sort,
    sort_order: "desc",
  });
  if (minPrice != null) params.set("min_price", String(minPrice));
  if (maxPrice != null) params.set("max_price", String(maxPrice));

  await rateLimiter.wait("ETSY");
  try {
    const response = await fetch(`${BASE_URL}/listings/active?${params}`, {
      headers: {
        "x-api-key": `${CONFIG.ETSY_API_KEY}:${CONFIG.ETSY_SHARED_SECRET}`,
      },
    });
    if (!response.ok) {
      return { error: `Etsy API returned ${response.status}` };
    }
    const data = (await response.json()) as {
      count?: number;
      results?: EtsySearchListing[];
    };
    const results = data.results ?? [];

    return {
      query: trimmed,
      totalOnEtsy: data.count ?? results.length,
      listings: results.map((item: EtsySearchListing) => ({
        listingId: String(item.listing_id),
        title: item.title,
        price: item.price?.amount ? item.price.amount / item.price.divisor : null,
        currency: item.price?.currency_code ?? null,
        url: item.url || `https://www.etsy.com/listing/${item.listing_id}`,
        favorites: item["num_favorers"] ?? 0,
        createdAt: item.original_creation_timestamp
          ? new Date(item.original_creation_timestamp * 1000).toISOString()
          : null,
        description: item.description?.slice(0, 300) ?? null,
      })),
    };
  } catch (error: unknown) {
    return { error: `Etsy search failed: ${errorMessage(error)}` };
  }
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
  if (!CONFIG.ETSY_SHARED_SECRET) {
    throw new Error("ETSY_SHARED_SECRET not configured");
  }

  const apiKey = `${CONFIG.ETSY_API_KEY}:${CONFIG.ETSY_SHARED_SECRET}`;

  const trendingKeywords = [
    "trending",
    "bestseller",
    "popular",
    "best seller",
    "most popular",
  ];

  const allProducts: ProductInput[] = [];

  for (const keyword of trendingKeywords) {
    await rateLimiter.wait("ETSY");
    try {
      const params = new URLSearchParams({
        keywords: keyword,
        limit: "25",
        sort_on: "score",
        sort_order: "desc",
      });

      const response = await fetch(`${BASE_URL}/listings/active?${params}`, {
        headers: {
          "x-api-key": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Etsy API returned ${response.status}`);
      }

      const data = (await response.json()) as { results?: EtsyListing[] };
      const listings = data.results || [];

      const products = listings.map((item: EtsyListing, index: number) => {
        const product = {
          sourceId: String(item.listing_id),
          source: PRODUCT_SOURCES.ETSY,
          name: item.title,
          category: mapEtsyCategory(item.tags || []),
          sourceCategory: item.taxonomy_path?.join(" > ") || "Etsy",
          rank: index + 1,
          price: item.price?.amount
            ? item.price.amount / item.price.divisor
            : undefined,
          currency: item.price?.currency_code || "USD",
          rating: undefined,
          reviewCount: item['num_favorers'] || 0,
          imageUrl: item.images?.[0]?.url_570xN || undefined,
          productUrl:
            item.url || `https://www.etsy.com/listing/${item.listing_id}`,
          description: item.description?.slice(0, 200) || undefined,
          trendingScore: 0,
          views: item.views || 0,
          fetchedAt: new Date(),
        };
        product.trendingScore = computeTrendingScore(product);
        return product;
      });

      allProducts.push(...products);
    } catch (error: unknown) {
      logger.error(`[Etsy] ❌ "${keyword}": ${errorMessage(error)}`);
    }
  }

  // Deduplicate by listing ID
  const seen = new Set<string>();
  const unique = allProducts.filter((productInput: ProductInput) => {
    if (seen.has(productInput.sourceId)) return false;
    seen.add(productInput.sourceId);
    return true;
  });

  return unique;
}

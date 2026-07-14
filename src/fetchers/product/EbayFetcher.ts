import { TokenManager } from "@rodrigo-barraza/utilities-library/node";
import CONFIG from "../../config.ts";
import { PRODUCT_SOURCES, EBAY_CATEGORIES } from "../../constants.ts";
import { computeTrendingScore, errorMessage } from "../../utilities.ts";
import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
import type { ProductInput } from "../../models/Product.ts";
const BASE_URL = "https://api.ebay.com/buy/browse/v1";
// ─── OAuth2 Token Management ──────────────────────────────────────
const ebayTokenManager = new TokenManager(async () => {
  const credentials = Buffer.from(
    `${CONFIG.EBAY_CLIENT_ID}:${CONFIG.EBAY_CLIENT_SECRET}`,
  ).toString("base64");
  const response = await fetch(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    },
  );
  if (!response.ok) {
    throw new Error(`eBay OAuth failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    token: data.access_token,
    expiresInMilliseconds: 7_000_000, // ~2 hours (eBay tokens last ~2hrs)
  };
});
interface EbayCategory {
  id: string;
  name: string;
  unified: string;
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  image?: { imageUrl: string };
  thumbnailImages?: Array<{ imageUrl: string }>;
  itemWebUrl?: string;
  shortDescription?: string;
  condition?: string;
  buyingOptions?: string[];
  itemLocation?: { city?: string; stateOrProvince?: string; country?: string };
  seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number };
  itemCreationDate?: string;
  shippingOptions?: Array<{ shippingCost?: { value: string; currency: string } }>;
}

// ─── On-Demand Keyword Search ─────────────────────────────────────

const EBAY_SEARCH_SORTS: Record<string, string | null> = {
  best_match: null, // API default
  price_asc: "price",
  price_desc: "-price",
  newest: "newlyListed",
};

export interface EbaySearchOptions {
  limit?: number;
  sort?: string;
  marketplace?: string;
}

export interface EbaySearchResult {
  query: string;
  marketplace: string;
  totalOnEbay: number;
  listings: {
    itemId: string;
    title: string;
    price: number | null;
    currency: string | null;
    condition: string | null;
    buyingOptions: string[];
    url: string | null;
    imageUrl: string | null;
    location: string | null;
    sellerUsername: string | null;
    sellerFeedbackPercentage: string | null;
    listedAt: string | null;
  }[];
}

/**
 * Search live eBay listings by keyword via the official Browse API.
 */
export async function searchEbayListings(
  query: string,
  { limit = 20, sort = "best_match", marketplace = "EBAY_CA" }: EbaySearchOptions = {},
): Promise<EbaySearchResult | { error: string }> {
  if (!CONFIG.EBAY_CLIENT_ID || !CONFIG.EBAY_CLIENT_SECRET) {
    return { error: "EBAY_CLIENT_ID and EBAY_CLIENT_SECRET not configured" };
  }
  const trimmed = query.trim();
  if (!trimmed) return { error: "Query is required" };
  if (!(sort in EBAY_SEARCH_SORTS)) {
    return {
      error: `Unknown sort '${sort}'. Use one of: ${Object.keys(EBAY_SEARCH_SORTS).join(", ")}`,
    };
  }

  const params = new URLSearchParams({
    "q": trimmed,
    limit: String(Math.min(Math.max(limit, 1), 50)),
  });
  const sortValue = EBAY_SEARCH_SORTS[sort];
  if (sortValue) params.set("sort", sortValue);

  await rateLimiter.wait("EBAY");
  try {
    const token = await ebayTokenManager.getToken();
    const response = await fetch(
      `${BASE_URL}/item_summary/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": marketplace,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      return { error: `eBay Browse API returned ${response.status}` };
    }
    const data = (await response.json()) as {
      total?: number;
      itemSummaries?: EbayItemSummary[];
    };
    const items = data.itemSummaries ?? [];

    return {
      query: trimmed,
      marketplace,
      totalOnEbay: data.total ?? items.length,
      listings: items.map((item: EbayItemSummary) => ({
        itemId: item.itemId,
        title: item.title,
        price: item.price ? parseFloat(item.price.value) : null,
        currency: item.price?.currency ?? null,
        condition: item.condition ?? null,
        buyingOptions: item.buyingOptions ?? [],
        url: item.itemWebUrl ?? null,
        imageUrl:
          item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
        location:
          [item.itemLocation?.city, item.itemLocation?.stateOrProvince, item.itemLocation?.country]
            .filter(Boolean)
            .join(", ") || null,
        sellerUsername: item.seller?.username ?? null,
        sellerFeedbackPercentage: item.seller?.feedbackPercentage ?? null,
        listedAt: item.itemCreationDate ?? null,
      })),
    };
  } catch (error: unknown) {
    return { error: `eBay search failed: ${errorMessage(error)}` };
  }
}

/**
 * Search eBay for popular items in a category, sorted by most watched.
 */
async function fetchEbayCategoryTrending(
  token: string,
  category: EbayCategory,
) {
  const params = new URLSearchParams({
    category_ids: category.id,
    sort: "-price",
    limit: "20",
    filter: "buyingOptions:{FIXED_PRICE},conditionIds:{1000}",
  });
  const response = await fetch(`${BASE_URL}/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `eBay Browse API returned ${response.status} for ${category.name}`,
    );
  }
  const data = (await response.json()) as { itemSummaries?: EbayItemSummary[] };
  const items = data.itemSummaries || [];
  return items.slice(0, 15).map((item: EbayItemSummary, index: number) => {
    const product: ProductInput = {
      sourceId: item.itemId,
      source: PRODUCT_SOURCES.EBAY,
      name: item.title,
      category: category.unified,
      sourceCategory: category.name,
      rank: index + 1,
      price: item.price ? parseFloat(item.price.value) : undefined,
      currency: item.price?.currency || "USD",
      rating: undefined,
      reviewCount: undefined,
      imageUrl:
        item.image?.imageUrl ||
        item.thumbnailImages?.[0]?.imageUrl ||
        undefined,
      productUrl: item.itemWebUrl || undefined,
      description: item.shortDescription || undefined,
      trendingScore: 0,
      fetchedAt: new Date(),
    };
    product.trendingScore = computeTrendingScore(product);
    return product;
  });
}
/**
 * Fetch trending products across all eBay categories.
 */
export async function fetchAllEbayTrending(): Promise<ProductInput[]> {
  if (!CONFIG.EBAY_CLIENT_ID || !CONFIG.EBAY_CLIENT_SECRET) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET not configured");
  }
  const token = await ebayTokenManager.getToken();
  const allProducts: ProductInput[] = [];
  for (const ebayCategory of EBAY_CATEGORIES) {
    await rateLimiter.wait("EBAY");
    try {
      const products = await fetchEbayCategoryTrending(token, ebayCategory);
      allProducts.push(...products);
      logger.info(
        `[eBay] ✅ ${ebayCategory.name}: ${products.length} products`,
      );
    } catch (error: unknown) {
      logger.error(`[eBay] ❌ ${ebayCategory.name}: ${errorMessage(error)}`);
    }
  }
  return allProducts;
}

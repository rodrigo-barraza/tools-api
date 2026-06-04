import * as cheerio from "cheerio";
import {
  AMAZON_CATEGORIES,
  PRODUCT_SOURCES,
  AMAZON_MAX_PRODUCTS_PER_CATEGORY,
} from "../../constants.ts";
import { parsePrice } from "@rodrigo-barraza/utilities-library";
import {
  randomUserAgent,
  computeTrendingScore,
  errorMessage,
} from "../../utilities.ts";
import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";
import type { ProductInput } from "../../models/Product.ts";

const BASE_URL = "https://www.amazon.com/Best-Sellers/zgbs";
const AMAZON_BEST_SELLERS_MAX_PAGES = 2;

/**
 * Parse products from a single Amazon Best Sellers HTML page.
 * Returns parsed products and the set of ASINs found on this page.
 */
function parseProductsFromPage(
  html: string,
  unifiedCategory: string,
  categoryName: string,
  existingAsinSet: Set<string>,
  currentProductCount: number,
): ProductInput[] {
  const $ = cheerio.load(html);
  const products: ProductInput[] = [];

  $("[data-asin]").each((_i, element) => {
    if (currentProductCount + products.length >= AMAZON_MAX_PRODUCTS_PER_CATEGORY) return false;

    const $el = $(element);
    const asin = $el.attr("data-asin");
    if (!asin || existingAsinSet.has(asin)) return;

    // Extract product name — multiple possible selectors
    const name =
      $el.find(".p13n-sc-truncate-desktop-type2").text().trim() ||
      $el.find("._cDEzb_p13n-sc-css-line-clamp-3_g3dy1").text().trim() ||
      $el.find(".a-link-normal span div").first().text().trim() ||
      $el.find("[class*='truncate']").first().text().trim();

    if (!name) return;

    // Extract rank from the rank number badge
    const rankText =
      $el.find(".zg-bdg-text").text().trim() ||
      $el.find("[class*='zg-badge-text']").text().trim();
    const rank = rankText
      ? parseInt(rankText.replace("#", ""), 10)
      : currentProductCount + products.length + 1;

    // Extract price
    const priceText = $el
      .find(
        ".p13n-sc-price, ._cDEzb_p13n-sc-price_3mJ9Z, .a-price .a-offscreen",
      )
      .first()
      .text()
      .trim();
    const price = parsePrice(priceText) ?? undefined;

    // Extract rating
    const ratingText =
      $el.find(".a-icon-alt").first().text().trim() ||
      $el.find("[class*='a-star']").attr("class") ||
      "";
    const ratingMatch = ratingText.match(/([\d.]+)\s*out of/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

    // Extract review count
    const reviewText =
      $el.find(".a-size-small .a-link-normal").text().trim() ||
      $el.find("[class*='review'] .a-size-small").text().trim();
    const reviewCount = reviewText
      ? parseInt(reviewText.replace(/[^0-9]/g, ""), 10) || undefined
      : undefined;

    // Extract image
    const imageUrl =
      $el.find("img.a-dynamic-image, img[data-a-dynamic-image]").attr("src") ||
      $el.find("img").first().attr("src") ||
      undefined;

    // Build product URL
    const productUrl = `https://www.amazon.com/dp/${asin}`;

    const product: ProductInput = {
      sourceId: asin,
      source: PRODUCT_SOURCES.AMAZON,
      name,
      category: unifiedCategory,
      sourceCategory: categoryName,
      rank,
      price,
      currency: "USD",
      rating,
      reviewCount,
      imageUrl,
      productUrl,
      description: undefined,
      trendingScore: 0,
      fetchedAt: new Date(),
    };
    product.trendingScore = computeTrendingScore(product);
    existingAsinSet.add(asin);
    products.push(product);
  });

  return products;
}

/**
 * Scrape Amazon Best Sellers for a single category across multiple pages.
 * Amazon Best Sellers supports up to 2 pages per category (~50 items each).
 */
async function scrapeCategory(
  slug: string,
  categoryName: string,
  unifiedCategory: string,
) {
  const allCategoryProducts: ProductInput[] = [];
  const seenAsinSet = new Set<string>();

  for (let pageNumber = 1; pageNumber <= AMAZON_BEST_SELLERS_MAX_PAGES; pageNumber++) {
    const url =
      pageNumber === 1
        ? `${BASE_URL}/${slug}`
        : `${BASE_URL}/${slug}?pg=${pageNumber}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": randomUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      if (pageNumber === 1) {
        throw new Error(`Amazon returned ${response.status} for ${categoryName}`);
      }
      break;
    }

    const html = await response.text();
    const pageProducts = parseProductsFromPage(
      html,
      unifiedCategory,
      categoryName,
      seenAsinSet,
      allCategoryProducts.length,
    );

    allCategoryProducts.push(...pageProducts);

    if (
      pageProducts.length === 0 ||
      allCategoryProducts.length >= AMAZON_MAX_PRODUCTS_PER_CATEGORY
    ) {
      break;
    }

    // Rate limit between page requests within the same category
    if (pageNumber < AMAZON_BEST_SELLERS_MAX_PAGES) {
      await rateLimiter.wait("AMAZON");
    }
  }

  return allCategoryProducts;
}

/**
 * Fetch Amazon Best Sellers across all configured categories.
 * Rate-limited to respect Amazon's servers.
 */
export async function fetchAllAmazonBestSellers(): Promise<ProductInput[]> {
  const allProducts: ProductInput[] = [];

  for (const amazonCategory of AMAZON_CATEGORIES) {
    try {
      const products = await scrapeCategory(
        amazonCategory.slug,
        amazonCategory.name,
        amazonCategory.unified,
      );
      allProducts.push(...products);
      logger.info(
        `[Amazon] ✅ ${amazonCategory.name}: ${products.length} products`,
      );
    } catch (error: unknown) {
      logger.error(
        `[Amazon] ❌ ${amazonCategory.name}: ${errorMessage(error)}`,
      );
    }

    // Rate limit between category requests
    await rateLimiter.wait("AMAZON");
  }

  return allProducts;
}


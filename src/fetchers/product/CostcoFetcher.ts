import * as cheerio from "cheerio";
import {
  COSTCO_US_CATEGORIES,
  COSTCO_CA_CATEGORIES,
  PRODUCT_SOURCES,
  COSTCO_MAX_PRODUCTS_PER_CATEGORY,
} from "../../constants.ts";
import { parsePrice } from "@rodrigo-barraza/utilities-library";
import {
  computeTrendingScore,
  buildScraperHeaders,
  errorMessage,
} from "../../utilities.ts";
import rateLimiter from "../../services/RateLimiterService.ts";
import logger from "../../logger.ts";

// ─── Base URLs ─────────────────────────────────────────────────────

const COSTCO_US_BASE = "https://www.costco.com";
const COSTCO_CA_BASE = "https://www.costco.ca";

// ─── Parsers ───────────────────────────────────────────────────────

/**
 * Extract the Costco product ID from a URL or href.
 * Costco URLs follow: .../product.{ID}.html
 */
function extractProductId(href: string | undefined) {
  if (!href) return null;
  const match = href.match(/product\.(\d+)\.html/);
  return match ? match[1] : null;
}

/**
 * Extract rating value from Costco review stars markup.
 * Looks for patterns like "4.5 out of 5 stars" or aria-label text.
 */
function extractRating(text: string | undefined) {
  if (!text) return null;
  const match = text.match(/([\d.]+)\s*(?:out of|\/)\s*5/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract review count from text like "(40)" or "40 reviews".
 */
function extractReviewCount(text: string | undefined) {
  if (!text) return null;
  const match = text.match(/\((\d+)\)/);
  if (match) return parseInt(match[1], 10);
  const match2 = text.match(/(\d+)\s*review/i);
  return match2 ? parseInt(match2[1], 10) : null;
}

// ─── Scraper ───────────────────────────────────────────────────────

/**
 * Scrape a single Costco category page.
 * Uses multiple selector strategies to handle Costco's MUI-based layout.
 */
async function scrapeCategory(
  baseUrl: string,
  slug: string,
  categoryName: string,
  unifiedCategory: string,
  source: string,
  currency: string,
) {
  const url = `${baseUrl}/${slug}`;

  const response = await fetch(url, {
    headers: buildScraperHeaders(`${baseUrl}/`),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Costco returned ${response.status} for ${categoryName}`);
  }

  const html = await response.text();

  // Check for access denied / bot detection
  if (
    html.includes("Access Denied") ||
    html.includes("robot") ||
    html.length < 5000
  ) {
    throw new Error(
      `Costco blocked request for ${categoryName} (bot detection)`,
    );
  }

  const CHEERIOAPI = cheerio.load(html);
  const products: unknown[] = [];

  // ── Strategy 1: MUI-based product tiles (data-testid) ─────────
  CHEERIOAPI('[data-testid^="ProductTile_"]').each((_i, element) => {
    if (products.length >= COSTCO_MAX_PRODUCTS_PER_CATEGORY) return false;

    const $element = CHEERIOAPI(element);
    const tileText = $element.text();

    // Title & URL — find the main product link
    const $link =
      $element.find('a[href*="product."]').first() ||
      $element.find("a.MuiLink-root").first();
    const href = $link.attr("href") || "";
    const name = $link.text().trim();
    if (!name) return;

    const productId = extractProductId(href);
    const productUrl = href.startsWith("http")
      ? href
      : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

    // Price — find dollar amounts in the tile
    const priceMatch = tileText.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    const price = priceMatch ? parsePrice(priceMatch[0]) : null;

    // Image
    const $img =
      $element.find('[data-testid^="ProductImage_"] img').first() ||
      $element.find("img").first();
    const imageUrl = $img.attr("src") || $img.attr("data-src") || null;

    // Rating & reviews
    const rating = extractRating(tileText);
    const reviewCount = extractReviewCount(tileText);

    const product = {
      sourceId: productId || `costco-${products.length}`,
      source,
      name,
      category: unifiedCategory,
      sourceCategory: categoryName,
      rank: products.length + 1,
      price,
      currency,
      rating,
      reviewCount,
      imageUrl,
      productUrl,
      description: null,
      trendingScore: 0,
      fetchedAt: new Date(),
    };
    product.trendingScore = computeTrendingScore(product);
    products.push(product);
  });

  // ── Strategy 2: Legacy Costco layout (fallback) ───────────────
  if (products.length === 0) {
    CHEERIOAPI(".product-tile, .product, .col-xs-6.col-lg-4.col-xl-3").each(
      (_i, element) => {
        if (products.length >= COSTCO_MAX_PRODUCTS_PER_CATEGORY) return false;

        const $element = CHEERIOAPI(element);

        // Title & URL
        const $link = $element
          .find("a[href*='.product.'], a[href*='product.']")
          .first();
        const href = $link.attr("href") || "";
        const name =
          $element.find(".description, .product-title").text().trim() ||
          $link.text().trim();
        if (!name) return;

        const productId = extractProductId(href);
        const productUrl = href.startsWith("http")
          ? href
          : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

        // Price
        const priceText = $element
          .find(".price, [class*='price']")
          .first()
          .text();
        const price = parsePrice(priceText);

        // Image
        const imageUrl =
          $element.find("img.product-img, img").first().attr("src") || null;

        // Rating
        const ratingText =
          $element.find(".stars, [class*='star']").attr("aria-label") || "";
        const rating = extractRating(ratingText);
        const reviewText = $element.find(".reviews, [class*='review']").text();
        const reviewCount = extractReviewCount(reviewText);

        const product = {
          sourceId: productId || `costco-${products.length}`,
          source,
          name,
          category: unifiedCategory,
          sourceCategory: categoryName,
          rank: products.length + 1,
          price,
          currency,
          rating,
          reviewCount,
          imageUrl,
          productUrl,
          description: null,
          trendingScore: 0,
          fetchedAt: new Date(),
        };
        product.trendingScore = computeTrendingScore(product);
        products.push(product);
      },
    );
  }

  return products;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Fetch products from Costco US across all configured categories.
 */
export async function fetchAllCostcoUS() {
  const allProducts: unknown[] = [];

  for (const costcoUsCategory of COSTCO_US_CATEGORIES) {
    try {
      const products = await scrapeCategory(
        COSTCO_US_BASE,
        costcoUsCategory.slug,
        costcoUsCategory.name,
        costcoUsCategory.unified,
        PRODUCT_SOURCES.COSTCO_US,
        "USD",
      );
      allProducts.push(...products);
      logger.info(
        `[Costco US] ✅ ${costcoUsCategory.name}: ${products.length} products`,
      );
    } catch (error: unknown) {
      logger.error(
        `[Costco US] ❌ ${costcoUsCategory.name}: ${errorMessage(error)}`,
      );
    }

    await rateLimiter.wait("COSTCO");
  }

  return allProducts;
}

/**
 * Fetch products from Costco Canada across all configured categories.
 */
export async function fetchAllCostcoCA() {
  const allProducts: unknown[] = [];

  for (const costcoCaCategory of COSTCO_CA_CATEGORIES) {
    try {
      const products = await scrapeCategory(
        COSTCO_CA_BASE,
        costcoCaCategory.slug,
        costcoCaCategory.name,
        costcoCaCategory.unified,
        PRODUCT_SOURCES.COSTCO_CA,
        "CAD",
      );
      allProducts.push(...products);
      logger.info(
        `[Costco CA] ✅ ${costcoCaCategory.name}: ${products.length} products`,
      );
    } catch (error: unknown) {
      logger.error(
        `[Costco CA] ❌ ${costcoCaCategory.name}: ${errorMessage(error)}`,
      );
    }

    await rateLimiter.wait("COSTCO");
  }

  return allProducts;
}

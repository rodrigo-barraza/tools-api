import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Router } from "express";
import logger from "../logger.ts";
import { getRecentProducts, searchProducts } from "../models/Product.ts";
import {
  getAll,
  getBySource,
  getByCategory,
  getTrending,
  getCategories,
  searchByName,
  getHealth,
} from "../caches/ProductCache.ts";
import {
  getAll as getAvailabilityAll,
  getBySku,
  getInStock,
  getOutOfStock,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAvailabilityHealth,
} from "../caches/BestBuyCAAvailabilityCache.ts";
import { fetchBestBuyCAAvailability } from "../fetchers/product/BestBuyCAAvailabilityFetcher.ts";
const router = Router();
// ─── Existing Product Routes ───────────────────────────────────────
router.get("/products", (_req: any, res: any) => {
  res.json(getAll());
});
router.get("/products/trending", (req: any, res: any) => {
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(getTrending(limit));
});
router.get("/products/categories", (_req: any, res: any) => {
  res.json(getCategories());
});
router.get("/products/category/:category", (req: any, res: any) => {
  res.json(getByCategory(req.params.category as string));
});
router.get("/products/source/:source", (req: any, res: any) => {
  res.json(getBySource(req.params.source as string));
});
router.get("/products/search", (req: any, res: any) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchByName(query));
});
router.get("/products/recent", asyncHandler(async (req: any, res: any) => {
  const hours = parseIntParam(req.query.hours as string, 24);
  const category = req.query.category as string || null;
  const source = req.query.source as string || null;
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(await getRecentProducts(hours, category, source, limit));
}));
router.get("/products/db/search", asyncHandler(async (req: any, res: any) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(await searchProducts(query, limit));
}));
// ─── Best Buy CA Availability Routes ───────────────────────────────
router.get("/products/availability", (_req: any, res: any) => {
  res.json(getAvailabilityAll());
});
router.get("/products/availability/in-stock", (_req: any, res: any) => {
  res.json(getInStock());
});
router.get("/products/availability/out-of-stock", (_req: any, res: any) => {
  res.json(getOutOfStock());
});
router.get("/products/availability/sku/:sku", (req: any, res: any) => {
  const result = getBySku(req.params.sku as string);
  if (!result) {
    return res
      .status(404)
      .json({ error: `SKU ${req.params.sku as string} not found in cache` });
  }
  res.json(result);
});
/**
 * On-demand availability check for arbitrary SKUs (not watchlist-dependent).
 * GET /products/availability/check?skus=SKU1,SKU2,SKU3
 */
router.get("/products/availability/check", asyncHandler(async (req: any, res: any) => {
  const skusParam = req.query.skus as string;
  if (!skusParam) {
    return res
      .status(400)
      .json({ error: "Query parameter 'skus' is required (comma-separated)" });
  }
  const skus = skusParam
    .split(",")
    .map((s: any) => s.trim())
    .filter(Boolean);
  if (!skus.length) {
    return res.status(400).json({ error: "No valid SKUs provided" });
  }
  try {
    const { results, errors } = await fetchBestBuyCAAvailability(skus);
    res.json({
      count: results.length,
      inStockCount: results.filter((r: any) => r.inStock).length,
      results,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    logger.error(`Product availability check failed: ${error.message}`);
    res.status(502).json({ error: "Product search failed" });
  }
}));
// ─── Watchlist Management ──────────────────────────────────────────
router.get("/products/availability/watchlist", (_req: any, res: any) => {
  res.json(getWatchlist());
});
/**
 * Add SKUs to the watchlist.
 * POST body: { skus: [{ sku, name?, brand?, category? }] }
 */
router.post("/products/availability/watchlist", (req: any, res: any) => {
  const { skus } = req.body || {};
  if (!Array.isArray(skus) || !skus.length) {
    return res.status(400).json({
      error:
        "Request body must contain 'skus' array: [{ sku, name?, brand?, category? }]",
    });
  }
  const result = addToWatchlist(skus);
  res.json({ ...result, watchlist: getWatchlist() });
});
router.delete("/products/availability/watchlist/:sku", (req: any, res: any) => {
  const result = removeFromWatchlist(req.params.sku as string);
  res.json({ ...result, watchlist: getWatchlist() });
});
// ─── Health ────────────────────────────────────────────────────────
export function getProductHealth() {
  return {
    products: getHealth(),
    availability: getAvailabilityHealth(),
  };
}
export default router;

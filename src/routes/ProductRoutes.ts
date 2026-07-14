import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
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
import { searchEbayListings } from "../fetchers/product/EbayFetcher.ts";
import { searchEtsyListings } from "../fetchers/product/EtsyFetcher.ts";
import { errorMessage } from "../utilities.ts";

const router = Router();
// ─── Existing Product Routes ───────────────────────────────────────
router.get("/products", (_req: Request, res: Response) => {
  res.json(getAll());
});
router.get("/products/trending", (req: Request, res: Response) => {
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(getTrending(limit));
});
router.get("/products/categories", (_req: Request, res: Response) => {
  res.json(getCategories());
});
router.get("/products/category/:category", (req: Request, res: Response) => {
  res.json(getByCategory(req.params.category as string));
});
router.get("/products/source/:source", (req: Request, res: Response) => {
  res.json(getBySource(req.params.source as string));
});
router.get("/products/search", (req: Request, res: Response) => {
  const query = req.query['q'] as string;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchByName(query));
});
router.get(
  "/products/recent",
  asyncHandler(async (req: Request, res: Response) => {
    const hours = parseIntParam(req.query.hours as string, 24);
    const category = (req.query.category as string) || null;
    const source = (req.query.source as string) || null;
    const limit = parseIntParam(req.query.limit as string, 50);
    res.json(await getRecentProducts(hours, category, source, limit));
  }),
);
router.get(
  "/products/db/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const limit = parseIntParam(req.query.limit as string, 50);
    res.json(await searchProducts(query, limit));
  }),
);
// ─── Best Buy CA Availability Routes ───────────────────────────────
router.get("/products/availability", (_req: Request, res: Response) => {
  res.json(getAvailabilityAll());
});
router.get(
  "/products/availability/in-stock",
  (_req: Request, res: Response) => {
    res.json(getInStock());
  },
);
router.get(
  "/products/availability/out-of-stock",
  (_req: Request, res: Response) => {
    res.json(getOutOfStock());
  },
);
router.get("/products/availability/sku/:sku", (req: Request, res: Response) => {
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
router.get(
  "/products/availability/check",
  asyncHandler(async (req: Request, res: Response) => {
    const skusParam = req.query.skus as string;
    if (!skusParam) {
      return res
        .status(400)
        .json({
          error: "Query parameter 'skus' is required (comma-separated)",
        });
    }
    const skus = skusParam
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (!skus.length) {
      return res.status(400).json({ error: "No valid SKUs provided" });
    }
    try {
      const { results, errors } = await fetchBestBuyCAAvailability(skus);
      res.json({
        count: results.length,
        inStockCount: results.filter(
          (r) => (r as Record<string, unknown>).inStock,
        ).length,
        results,
        errors: errors.length ? errors : undefined,
      });
    } catch (error: unknown) {
      logger.error(`Product availability check failed: ${errorMessage(error)}`);
      res.status(502).json({ error: "Product search failed" });
    }
  }),
);
// ─── Watchlist Management ──────────────────────────────────────────
router.get(
  "/products/availability/watchlist",
  (_req: Request, res: Response) => {
    res.json(getWatchlist());
  },
);
/**
 * Add SKUs to the watchlist.
 * POST body: { skus: [{ sku, name?, brand?, category? }] }
 */
router.post(
  "/products/availability/watchlist",
  (req: Request, res: Response) => {
    const { skus } = req.body || {};
    if (!Array.isArray(skus) || !skus.length) {
      return res.status(400).json({
        error:
          "Request body must contain 'skus' array: [{ sku, name?, brand?, category? }]",
      });
    }
    const result = addToWatchlist(skus);
    res.json({ ...result, watchlist: getWatchlist() });
  },
);
router.delete(
  "/products/availability/watchlist/:sku",
  (req: Request, res: Response) => {
    const result = removeFromWatchlist(req.params.sku as string);
    res.json({ ...result, watchlist: getWatchlist() });
  },
);
// ─── Health ────────────────────────────────────────────────────────
export function getProductHealth() {
  return {
    products: getHealth(),
    availability: getAvailabilityHealth(),
  };
}

// ─── Marketplace Keyword Search (eBay / Etsy) ──────────────────────

router.get(
  "/ebay/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    const sort = req.query.sort as string | undefined;
    const marketplace = req.query.marketplace as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const result = await searchEbayListings(query, {
      limit: limit ? parseIntParam(limit, 20) : undefined,
      sort,
      marketplace,
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);

router.get(
  "/etsy/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const limit = req.query.limit as string | undefined;
    const sort = req.query.sort as string | undefined;
    const minPrice = req.query.minPrice as string | undefined;
    const maxPrice = req.query.maxPrice as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const result = await searchEtsyListings(query, {
      limit: limit ? parseIntParam(limit, 20) : undefined,
      sort,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);
export default router;

import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { Request, Response, Router } from "express";
import {
  getRecentTrends,
  searchTrendsDB,
  getTopTrends,
} from "../models/Trend.ts";
import {
  getAll,
  getBySource,
  getByCategory,
  getCorrelatedTrends,
  searchTrends,
  getHealth,
} from "../caches/TrendCache.ts";
const router = Router();
router.get("/trends", (_req: Request, res: Response) => {
  res.json(getAll());
});
router.get("/trends/hot", (_req: Request, res: Response) => {
  res.json(getCorrelatedTrends());
});
router.get("/trends/source/:source", (req: Request, res: Response) => {
  res.json(getBySource(req.params.source as string));
});
router.get("/trends/category/:category", (req: Request, res: Response) => {
  res.json(getByCategory(req.params.category as string));
});
router.get("/trends/search", (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchTrends(query));
});
router.get("/trends/recent", asyncHandler(async (req: Request, res: Response) => {
  const hours = parseIntParam(req.query.hours as string, 24);
  const category = req.query.category as string || null;
  const source = req.query.source as string || null;
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(await getRecentTrends(hours, category, source, limit));
}));
router.get("/trends/top", asyncHandler(async (req: Request, res: Response) => {
  const hours = parseIntParam(req.query.hours as string, 24);
  const limit = parseIntParam(req.query.limit as string, 20);
  res.json(await getTopTrends(hours, limit));
}));
router.get("/trends/db/search", asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(await searchTrendsDB(query, limit));
}));
export function getTrendHealth() {
  return getHealth();
}
// ── Unified Trends Dispatcher ──────────────────────────────────────
router.get("/data", asyncHandler(async (req: Request, res: Response) => {
  const { action, source, hours, limit: rawLimit } = req.query as Record<string, string | undefined>;
  if (!action) return res.status(400).json({ error: "'action' is required", actions: ["current", "hot", "top"] });
  const limit = rawLimit ? parseIntParam(rawLimit, 20) : undefined;
  switch (action) {
    case "current": {
      const trends = source ? getBySource(source) : getAll();
      return res.json({ action, ...trends });
    }
    case "hot":
      return res.json({ action, ...getCorrelatedTrends() });
    case "top": {
      const hoursBack = parseIntParam(hours, 24);
      return res.json({ action, ...(await getTopTrends(hoursBack, limit || 20)) });
    }
    default:
      return res.status(400).json({ error: `Unknown action: ${action}`, actions: ["current", "hot", "top"] });
  }
}));
export default router;

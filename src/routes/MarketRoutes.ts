import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { Router } from "express";
import { getHistory } from "../models/CommoditySnapshot.ts";
import {
  getAllCommodities,
  getCommoditiesByCategory,
  getCommodityByTicker,
  getCommoditySummary,
  getCommodityHealth,
} from "../caches/CommodityCache.ts";
import { ASSET_CATEGORIES } from "../constants.ts";
const router = Router();
router.get("/commodities", (_req: any, res: any) => {
  res.json(getAllCommodities());
});
router.get("/commodities/summary", (_req: any, res: any) => {
  res.json(getCommoditySummary());
});
router.get("/commodities/categories", (_req: any, res: any) => {
  res.json(Object.values(ASSET_CATEGORIES));
});
router.get("/commodities/category/:category", (req: any, res: any) => {
  const category = (req.params.category as string).toLowerCase();
  const valid = Object.values(ASSET_CATEGORIES);
  if (!valid.includes(category)) {
    return res.status(400).json({
      error: `Invalid category. Valid: ${valid.join(", ")}`,
    });
  }
  res.json(getCommoditiesByCategory(category));
});
router.get("/commodities/ticker/:ticker", (req: any, res: any) => {
  const ticker = (req.params.ticker as string).toUpperCase();
  const commodity = getCommodityByTicker(ticker);
  if (!commodity) {
    return res.status(404).json({ error: `Ticker ${ticker} not found` });
  }
  res.json(commodity);
});
router.get("/commodities/history/:ticker", asyncHandler(async (req: any, res: any) => {
  const ticker = (req.params.ticker as string).toUpperCase();
  const hours = parseIntParam(req.query.hours as string, 24);
  const history = await getHistory(ticker, hours);
  res.json({ ticker, hours, count: history.length, snapshots: history });
}));
export function getMarketHealth() {
  return { commodities: getCommodityHealth() };
}
// ── Unified Commodities Dispatcher ─────────────────────────────────
router.get("/commodities/data", asyncHandler(async (req: any, res: any) => {
  const { action, category, ticker, hours: rawHours } = req.query as any;
  if (!action) return res.status(400).json({ error: "'action' is required", actions: ["summary", "category", "ticker", "categories", "history"] });
  switch (action) {
    case "summary":
      return res.json({ action, ...getCommoditySummary() });
    case "category": {
      if (!category) return res.status(400).json({ error: "'category' required for action=category" });
      const data = getCommoditiesByCategory(category.toLowerCase());
      return res.json({ action, category, ...(Array.isArray(data) ? { count: data.length, commodities: data } : data) });
    }
    case "ticker": {
      if (!ticker) return res.status(400).json({ error: "'ticker' required for action=ticker" });
      const commodity = getCommodityByTicker(ticker.toUpperCase());
      if (!commodity) return res.status(404).json({ error: `Ticker ${ticker} not found` });
      return res.json({ action, ...commodity });
    }
    case "categories":
      return res.json({ action, categories: Object.values(ASSET_CATEGORIES) });
    case "history": {
      if (!ticker) return res.status(400).json({ error: "'ticker' required for action=history" });
      const hours = parseIntParam(rawHours, 24);
      const history = await getHistory(ticker.toUpperCase(), hours);
      return res.json({ action, ticker: ticker.toUpperCase(), hours, count: history.length, snapshots: history });
    }
    default:
      return res.status(400).json({ error: `Unknown action: ${action}`, actions: ["summary", "category", "ticker", "categories", "history"] });
  }
}));
export default router;

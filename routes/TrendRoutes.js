import { Router } from "express";
import {
  getRecentTrends,
  searchTrendsDB,
  getTopTrends,
} from "../models/Trend.js";
import {
  getAll,
  getBySource,
  getByCategory,
  getCorrelatedTrends,
  searchTrends,
  getHealth,
} from "../caches/TrendCache.js";

const router = Router();

router.get("/trends", (_req, res) => {
  res.json(getAll());
});

router.get("/trends/hot", (_req, res) => {
  res.json(getCorrelatedTrends());
});

router.get("/trends/source/:source", (req, res) => {
  res.json(getBySource(req.params.source));
});

router.get("/trends/category/:category", (req, res) => {
  res.json(getByCategory(req.params.category));
});

router.get("/trends/search", (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchTrends(query));
});

router.get("/trends/recent", async (req, res) => {
  const hours = parseInt(req.query.hours || "24", 10);
  const category = req.query.category || null;
  const source = req.query.source || null;
  const limit = parseInt(req.query.limit || "50", 10);
  res.json(await getRecentTrends(hours, category, source, limit));
});

router.get("/trends/top", async (req, res) => {
  const hours = parseInt(req.query.hours || "24", 10);
  const limit = parseInt(req.query.limit || "20", 10);
  res.json(await getTopTrends(hours, limit));
});

router.get("/trends/db/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const limit = parseInt(req.query.limit || "50", 10);
  res.json(await searchTrendsDB(query, limit));
});

export function getTrendHealth() {
  return getHealth();
}

export default router;

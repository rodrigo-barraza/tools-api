import { Router } from "express";
import { getRecentProducts, searchProducts } from "../models/Product.js";
import {
  getAll,
  getBySource,
  getByCategory,
  getTrending,
  getCategories,
  searchByName,
  getHealth,
} from "../caches/ProductCache.js";

const router = Router();

router.get("/products", (_req, res) => {
  res.json(getAll());
});

router.get("/products/trending", (req, res) => {
  const limit = parseInt(req.query.limit || "50", 10);
  res.json(getTrending(limit));
});

router.get("/products/categories", (_req, res) => {
  res.json(getCategories());
});

router.get("/products/category/:category", (req, res) => {
  res.json(getByCategory(req.params.category));
});

router.get("/products/source/:source", (req, res) => {
  res.json(getBySource(req.params.source));
});

router.get("/products/search", (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchByName(query));
});

router.get("/products/recent", async (req, res) => {
  const hours = parseInt(req.query.hours || "24", 10);
  const category = req.query.category || null;
  const source = req.query.source || null;
  const limit = parseInt(req.query.limit || "50", 10);
  res.json(await getRecentProducts(hours, category, source, limit));
});

router.get("/products/db/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const limit = parseInt(req.query.limit || "50", 10);
  res.json(await searchProducts(query, limit));
});

export function getProductHealth() {
  return getHealth();
}

export default router;

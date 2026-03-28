import { PRODUCT_SOURCES, PRODUCT_CATEGORIES } from "../constants.js";

// ─── In-Memory Store ───────────────────────────────────────────────

const store = {
  [PRODUCT_SOURCES.BESTBUY]: {
    products: [],
    lastFetch: null,
    error: null,
  },
  [PRODUCT_SOURCES.AMAZON]: {
    products: [],
    lastFetch: null,
    error: null,
  },
  [PRODUCT_SOURCES.PRODUCTHUNT]: {
    products: [],
    lastFetch: null,
    error: null,
  },
  [PRODUCT_SOURCES.EBAY]: {
    products: [],
    lastFetch: null,
    error: null,
  },
  [PRODUCT_SOURCES.ETSY]: {
    products: [],
    lastFetch: null,
    error: null,
  },
  [PRODUCT_SOURCES.COSTCO_US]: {
    products: [],
    lastFetch: null,
    error: null,
  },
  [PRODUCT_SOURCES.COSTCO_CA]: {
    products: [],
    lastFetch: null,
    error: null,
  },
};

// ─── Update Methods ────────────────────────────────────────────────

export function updateProducts(source, products) {
  store[source].products = products;
  store[source].lastFetch = new Date();
  store[source].error = null;
}

export function setProductError(source, error) {
  store[source].error = {
    message: error.message,
    timestamp: new Date(),
  };
}

// ─── Query Methods ─────────────────────────────────────────────────

/**
 * Get all products across all sources, sorted by trending score.
 */
export function getAll() {
  const allProducts = Object.values(store).flatMap((s) => s.products);
  return {
    count: allProducts.length,
    products: allProducts.sort((a, b) => b.trendingScore - a.trendingScore),
  };
}

/**
 * Get products from a specific source.
 */
export function getBySource(source) {
  const entry = store[source];
  if (!entry) return { count: 0, products: [], error: "Unknown source" };
  return {
    source,
    count: entry.products.length,
    lastFetch: entry.lastFetch,
    products: entry.products.sort((a, b) => b.trendingScore - a.trendingScore),
  };
}

/**
 * Get products filtered by unified category.
 */
export function getByCategory(category) {
  const allProducts = Object.values(store)
    .flatMap((s) => s.products)
    .filter((p) => p.category === category)
    .sort((a, b) => b.trendingScore - a.trendingScore);

  return {
    category,
    count: allProducts.length,
    products: allProducts,
  };
}

/**
 * Get top trending products (cross-source, ranked by composite score).
 */
export function getTrending(limit = 50) {
  const allProducts = Object.values(store)
    .flatMap((s) => s.products)
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, limit);

  return {
    count: allProducts.length,
    products: allProducts,
  };
}

/**
 * List all available categories with product counts.
 */
export function getCategories() {
  const allProducts = Object.values(store).flatMap((s) => s.products);
  const categoryMap = {};

  for (const product of allProducts) {
    const cat = product.category || "other";
    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, count: 0, sources: new Set() };
    }
    categoryMap[cat].count++;
    categoryMap[cat].sources.add(product.source);
  }

  // Convert Sets to arrays and sort by count
  const categories = Object.values(categoryMap)
    .map((c) => ({ ...c, sources: [...c.sources] }))
    .sort((a, b) => b.count - a.count);

  // Also include any configured categories that have no products yet
  const allCategoryValues = Object.values(PRODUCT_CATEGORIES);
  for (const cat of allCategoryValues) {
    if (!categoryMap[cat]) {
      categories.push({ category: cat, count: 0, sources: [] });
    }
  }

  return {
    total: categories.length,
    categories,
  };
}

/**
 * Simple in-memory search by product name.
 */
export function searchByName(query) {
  const lower = query.toLowerCase();
  const allProducts = Object.values(store)
    .flatMap((s) => s.products)
    .filter((p) => p.name.toLowerCase().includes(lower))
    .sort((a, b) => b.trendingScore - a.trendingScore);

  return {
    query,
    count: allProducts.length,
    products: allProducts,
  };
}

// ─── Health ────────────────────────────────────────────────────────

export function getHealth() {
  const health = {};
  for (const [source, entry] of Object.entries(store)) {
    health[source] = {
      productCount: entry.products.length,
      lastFetch: entry.lastFetch,
      error: entry.error,
    };
  }
  return health;
}

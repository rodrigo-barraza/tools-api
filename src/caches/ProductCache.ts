import { PRODUCT_SOURCES, PRODUCT_CATEGORIES } from "../constants.ts";

// ─── In-Memory Store ───────────────────────────────────────────────

const store = {
  [PRODUCT_SOURCES.BESTBUY]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
  [PRODUCT_SOURCES.AMAZON]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
  [PRODUCT_SOURCES.PRODUCTHUNT]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
  [PRODUCT_SOURCES.EBAY]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
  [PRODUCT_SOURCES.ETSY]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
  [PRODUCT_SOURCES.COSTCO_US]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
  [PRODUCT_SOURCES.COSTCO_CA]: {
    products: [],
    lastFetch: null as any,
    error: null as any,
  },
};

// ─── Update Methods ────────────────────────────────────────────────

export function updateProducts(source: any, products: any) {
  store[source].products = products;
  store[source].lastFetch = new Date();
  store[source].error = null;
}

export function setProductError(source: any, error: any) {
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
  const allProducts = Object.values(store).flatMap((s: any) => s.products);
  return {
    count: allProducts.length,
    products: allProducts.sort((a: any, b: any) => b.trendingScore - a.trendingScore),
  };
}

/**
 * Get products from a specific source.
 */
export function getBySource(source: any) {
  const entry = store[source];
  if (!entry) return { count: 0, products: [], error: "Unknown source" };
  return {
    source,
    count: entry.products.length,
    lastFetch: entry.lastFetch,
    products: entry.products.sort((a: any, b: any) => b.trendingScore - a.trendingScore),
  };
}

/**
 * Get products filtered by unified category.
 */
export function getByCategory(category: any) {
  const allProducts = Object.values(store)
    .flatMap((s: any) => s.products)
    .filter((p: any) => p.category === category)
    .sort((a: any, b: any) => b.trendingScore - a.trendingScore);

  return {
    category,
    count: allProducts.length,
    products: allProducts,
  };
}

/**
 * Get top trending products (cross-source, ranked by composite score).
 */
export function getTrending(limit: any = 50) {
  const allProducts = Object.values(store)
    .flatMap((s: any) => s.products)
    .sort((a: any, b: any) => b.trendingScore - a.trendingScore)
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
  const allProducts = Object.values(store).flatMap((s: any) => s.products);
  const categoryMap: Record<string, any> = {};

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
    .map((c: any) => ({ ...c, sources: [...c.sources] }))
    .sort((a: any, b: any) => b.count - a.count);

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
export function searchByName(query: any) {
  const lower = query.toLowerCase();
  const allProducts = Object.values(store)
    .flatMap((s: any) => s.products)
    .filter((p: any) => p.name.toLowerCase().includes(lower))
    .sort((a: any, b: any) => b.trendingScore - a.trendingScore);

  return {
    query,
    count: allProducts.length,
    products: allProducts,
  };
}

// ─── Health ────────────────────────────────────────────────────────

export function getHealth() {
  const health: Record<string, any> = {};
  for (const [source, entry] of Object.entries(store)) {
    health[source] = {
      productCount: entry.products.length,
      lastFetch: entry.lastFetch,
      error: entry.error,
    };
  }
  return health;
}

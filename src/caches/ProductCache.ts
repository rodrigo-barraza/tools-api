import { PRODUCT_SOURCES, PRODUCT_CATEGORIES } from "../constants.ts";

export interface Product {
  name: string;
  source: string;
  category: string;
  trendingScore: number;
  [key: string]: unknown;
}

interface ProductCacheEntry {
  products: Product[];
  lastFetch: Date | null;
  error: { message: string; timestamp: Date } | null;
}

// ─── In-Memory Store ───────────────────────────────────────────────

const store: Record<string, ProductCacheEntry> = {
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

export function updateProducts(source: string, products: Product[]): void {
  const entry = store[source];
  if (entry) {
    entry.products = products;
    entry.lastFetch = new Date();
    entry.error = null;
  }
}

export function setProductError(source: string, error: Error): void {
  const entry = store[source];
  if (entry) {
    entry.error = {
      message: error.message,
      timestamp: new Date(),
    };
  }
}

// ─── Query Methods ─────────────────────────────────────────────────

/**
 * Get all products across all sources, sorted by trending score.
 */
export function getAll() {
  const allProducts = Object.values(store).flatMap(
    (storeEntry) => storeEntry.products,
  );
  return {
    count: allProducts.length,
    products: allProducts.sort(
      (firstItem, secondItem) =>
        secondItem.trendingScore - firstItem.trendingScore,
    ),
  };
}

/**
 * Get products from a specific source.
 */
export function getBySource(source: string) {
  const entry = store[source];
  if (!entry) return { count: 0, products: [], error: "Unknown source" };
  return {
    source,
    count: entry.products.length,
    lastFetch: entry.lastFetch,
    products: entry.products.sort(
      (firstItem, secondItem) =>
        secondItem.trendingScore - firstItem.trendingScore,
    ),
  };
}

/**
 * Get products filtered by unified category.
 */
export function getByCategory(category: string) {
  const allProducts = Object.values(store)
    .flatMap((storeEntry) => storeEntry.products)
    .filter((provider) => provider.category === category)
    .sort(
      (firstItem, secondItem) =>
        secondItem.trendingScore - firstItem.trendingScore,
    );

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
    .flatMap((storeEntry) => storeEntry.products)
    .sort(
      (firstItem, secondItem) =>
        secondItem.trendingScore - firstItem.trendingScore,
    )
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
  const allProducts = Object.values(store).flatMap(
    (storeEntry) => storeEntry.products,
  );
  const categoryMap: Record<
    string,
    { category: string; count: number; sources: Set<string> }
  > = {};

  for (const product of allProducts) {
    const productCategory = product.category || "other";
    if (!categoryMap[productCategory]) {
      categoryMap[productCategory] = {
        category: productCategory,
        count: 0,
        sources: new Set<string>(),
      };
    }
    categoryMap[productCategory].count++;
    categoryMap[productCategory].sources.add(product.source);
  }

  // Convert Sets to arrays and sort by count
  const categories = Object.values(categoryMap)
    .map((item) => ({ ...item, sources: [...item.sources] }))
    .sort((firstItem, secondItem) => secondItem.count - firstItem.count);

  // Also include any configured categories that have no products yet
  const allCategoryValues = Object.values(PRODUCT_CATEGORIES);
  for (const configuredCategory of allCategoryValues) {
    if (!categoryMap[configuredCategory]) {
      categories.push({ category: configuredCategory, count: 0, sources: [] });
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
export function searchByName(query: string) {
  const lower = query.toLowerCase();
  const allProducts = Object.values(store)
    .flatMap((storeEntry) => storeEntry.products)
    .filter((provider) => provider.name.toLowerCase().includes(lower))
    .sort(
      (firstItem, secondItem) =>
        secondItem.trendingScore - firstItem.trendingScore,
    );

  return {
    query,
    count: allProducts.length,
    products: allProducts,
  };
}

// ─── Health ────────────────────────────────────────────────────────

export function getHealth() {
  const health: Record<
    string,
    {
      productCount: number;
      lastFetch: Date | null;
      error: { message: string; timestamp: Date } | null;
    }
  > = {};
  for (const [source, entry] of Object.entries(store)) {
    health[source] = {
      productCount: entry.products.length,
      lastFetch: entry.lastFetch,
      error: entry.error,
    };
  }
  return health;
}

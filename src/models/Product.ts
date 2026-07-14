import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface ProductDocument {
  sourceId: string;
  source: string;
  name: string;
  category?: string;
  sourceCategory?: string;
  rank?: number;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  productUrl?: string;
  description?: string;
  trendingScore?: number;
  lastSeenAt?: Date;
  firstSeenAt?: Date;
  fetchedAt?: Date;
}

export interface ProductInput {
  sourceId: string;
  source: string;
  name: string;
  category?: string;
  sourceCategory?: string;
  rank?: number;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  productUrl?: string;
  description?: string;
  trendingScore?: number;
  fetchedAt?: Date;
}

let productCollection: Collection<ProductDocument> | null = null;

/**
 * Set up the products collection with indexes.
 */
export async function setupProductCollection() {
  const database = getDatabase();
  const collectionInstance = database.collection<ProductDocument>("products") as unknown as Collection<ProductDocument>;

  await collectionInstance.createIndex(
    { sourceId: 1, source: 1 },
    { unique: true },
  );
  await collectionInstance.createIndex({ category: 1 });
  await collectionInstance.createIndex({ source: 1 });
  await collectionInstance.createIndex({ lastSeenAt: -1 });
  await collectionInstance.createIndex({ trendingScore: -1 });
  await collectionInstance.createIndex(
    { name: "text", description: "text" },
    { weights: { name: 10, description: 1 } },
  );

  productCollection = collectionInstance;
  logger.info("📦 Product collection indexes ready");
}

/**
 * Bulk upsert products.
 */
export async function upsertProducts(products: ProductInput[]) {
  if (!productCollection || !products.length)
    return { upserted: 0, modified: 0 };

  const operations = products.map((productInput: ProductInput) => ({
    updateOne: {
      filter: { sourceId: productInput.sourceId, source: productInput.source },
      update: {
        $set: {
          name: productInput.name,
          category: productInput.category,
          sourceCategory: productInput.sourceCategory,
          rank: productInput.rank,
          price: productInput.price,
          currency: productInput.currency,
          rating: productInput.rating,
          reviewCount: productInput.reviewCount,
          imageUrl: productInput.imageUrl,
          productUrl: productInput.productUrl,
          description: productInput.description,
          trendingScore: productInput.trendingScore,
          lastSeenAt: new Date(),
          fetchedAt: productInput.fetchedAt,
        },
        $setOnInsert: { firstSeenAt: new Date() },
      },
      upsert: true,
    },
  }));

  const result = await productCollection.bulkWrite(operations, { ordered: false });
  return {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  };
}

/**
 * Query recent products from the database.
 */
export async function getRecentProducts(
  hours: number = 24,
  category: string | null = null,
  source: string | null = null,
  limit: number = 50,
) {
  if (!productCollection) return [];

  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const filter: Record<string, unknown> = { lastSeenAt: { $gte: cutoff } };
  if (category) filter.category = category;
  if (source) filter.source = source;

  return productCollection
    .find(filter)
    .sort({ trendingScore: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Full-text search products.
 */
export async function searchProducts(query: string, limit: number = 50) {
  if (!productCollection) return [];

  return productCollection
    .find({ $text: { $search: query } })
    .sort({ score: { $meta: "textScore" }, trendingScore: -1 })
    .limit(limit)
    .toArray();
}

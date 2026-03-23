import { getDB } from "../db.js";

let productCollection;

/**
 * Set up the products collection with indexes.
 */
export async function setupProductCollection() {
  const db = getDB();
  productCollection = db.collection("products");

  await productCollection.createIndex(
    { sourceId: 1, source: 1 },
    { unique: true },
  );
  await productCollection.createIndex({ category: 1 });
  await productCollection.createIndex({ source: 1 });
  await productCollection.createIndex({ lastSeenAt: -1 });
  await productCollection.createIndex({ trendingScore: -1 });
  await productCollection.createIndex(
    { name: "text", description: "text" },
    { weights: { name: 10, description: 1 } },
  );
  console.log("📦 Product collection indexes ready");
}

/**
 * Bulk upsert products.
 */
export async function upsertProducts(products) {
  if (!products.length) return { upserted: 0, modified: 0 };

  const ops = products.map((p) => ({
    updateOne: {
      filter: { sourceId: p.sourceId, source: p.source },
      update: {
        $set: {
          name: p.name,
          category: p.category,
          sourceCategory: p.sourceCategory,
          rank: p.rank,
          price: p.price,
          currency: p.currency,
          rating: p.rating,
          reviewCount: p.reviewCount,
          imageUrl: p.imageUrl,
          productUrl: p.productUrl,
          description: p.description,
          trendingScore: p.trendingScore,
          lastSeenAt: new Date(),
          fetchedAt: p.fetchedAt,
        },
        $setOnInsert: { firstSeenAt: new Date() },
      },
      upsert: true,
    },
  }));

  const result = await productCollection.bulkWrite(ops, { ordered: false });
  return {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  };
}

/**
 * Query recent products from the database.
 */
export async function getRecentProducts(
  hours = 24,
  category = null,
  source = null,
  limit = 50,
) {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const filter = { lastSeenAt: { $gte: cutoff } };
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
export async function searchProducts(query, limit = 50) {
  return productCollection
    .find({ $text: { $search: query } })
    .sort({ score: { $meta: "textScore" }, trendingScore: -1 })
    .limit(limit)
    .toArray();
}

import { MongoClient } from "mongodb";

let client = null;
let db = null;

/**
 * Connect to MongoDB and return the database instance.
 * Shared across all domains — single connection pool.
 * @param {string} uri - MongoDB connection string
 * @returns {Promise<import("mongodb").Db>}
 */
export async function connectDB(uri) {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  console.log(`📡 Connected to MongoDB: ${db.databaseName}`);
  return db;
}

/**
 * Get the shared database instance.
 * @returns {import("mongodb").Db}
 */
export function getDB() {
  if (!db) throw new Error("Database not connected — call connectDB() first");
  return db;
}

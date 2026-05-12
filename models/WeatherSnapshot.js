import { getDB } from "../db.js";
import logger from "../logger.js";

/**
 * Insert a weather snapshot document.
 */
export async function insertSnapshot(data) {
  try {
    const db = getDB();
    const collection = db.collection("snapshots");
    await collection.insertOne({
      ...data,
      createdAt: new Date(),
    });
  } catch (error) {
    logger.error("Failed to persist weather snapshot:", error.message);
  }
}

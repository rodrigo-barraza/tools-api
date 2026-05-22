import { getDB } from "../db.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

/**
 * Insert a weather snapshot document.
 */
export async function insertSnapshot(data: Record<string, unknown>) {
  try {
    const db = getDB();
    const collection = db.collection("snapshots");
    await collection.insertOne({
      ...data,
      createdAt: new Date(),
    });
  } catch (error: unknown) {
    logger.error("Failed to persist weather snapshot:", errorMessage(error));
  }
}

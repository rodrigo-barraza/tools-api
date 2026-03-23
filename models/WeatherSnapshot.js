import { getDB } from "../db.js";

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
    console.error("Failed to persist weather snapshot:", error.message);
  }
}

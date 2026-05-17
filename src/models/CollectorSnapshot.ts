import { getDB } from "../db.ts";
import logger from "../logger.ts";

// ═══════════════════════════════════════════════════════════════
//  Collector State — Per-Collection Persistence
// ═══════════════════════════════════════════════════════════════
// Each data type is stored in its own MongoDB collection.
// Documents are flat — fields at the top level, no `data` wrapper.
//   Objects: { _id: "current", fieldA, fieldB, ..., updatedAt }
//   Arrays:  { _id: "current", items: [...], updatedAt }
// ═══════════════════════════════════════════════════════════════

/**
 * Save the latest collector state to a dedicated collection.
 * Objects are spread at the top level. Arrays are stored under `items`.
 *


 */
export async function saveState(collectionName, data) {
  try {
    const db = getDB();
    const document = Array.isArray(data)
      ? { _id: "current", items: data, updatedAt: new Date() }
      : { _id: "current", ...data, updatedAt: new Date() };

    await db
      .collection(collectionName)
      .replaceOne({ _id: "current" as any }, document, { upsert: true });
  } catch (error) {
    logger.error(
      `[State] ⚠️ Failed to save "${collectionName}": ${error.message}`,
    );
  }
}

/**
 * Load the latest state from a dedicated collection.
 * Reconstructs the original payload shape (object or array).
 *

 * @returns {Promise<{ data: *, updatedAt: Date } | null>}
 */
export async function loadState(collectionName) {
  try {
    const db = getDB();
    const document = await db
      .collection(collectionName)
      .findOne({ _id: "current" as any });
    if (!document) return null;

    const { _id, updatedAt, items, ...rest } = document;

    // Array data stored under `items`
    if (items !== undefined && Object.keys(rest).length === 0) {
      return { data: items, updatedAt };
    }

    // Object data spread at top level
    return { data: rest, updatedAt };
  } catch (error) {
    logger.error(
      `[State] ⚠️ Failed to load "${collectionName}": ${error.message}`,
    );
    return null;
  }
}

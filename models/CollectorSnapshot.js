import { getDB } from "../db.js";

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
 * @param {string} collectionName - MongoDB collection name
 * @param {*} data - The payload to persist (object or array)
 */
export async function saveState(collectionName, data) {
  try {
    const db = getDB();
    const doc = Array.isArray(data)
      ? { _id: "current", items: data, updatedAt: new Date() }
      : { _id: "current", ...data, updatedAt: new Date() };

    await db
      .collection(collectionName)
      .replaceOne({ _id: "current" }, doc, { upsert: true });
  } catch (error) {
    console.error(
      `[State] ⚠️ Failed to save "${collectionName}": ${error.message}`,
    );
  }
}

/**
 * Load the latest state from a dedicated collection.
 * Reconstructs the original payload shape (object or array).
 *
 * @param {string} collectionName - MongoDB collection name
 * @returns {Promise<{ data: *, updatedAt: Date } | null>}
 */
export async function loadState(collectionName) {
  try {
    const db = getDB();
    const doc = await db
      .collection(collectionName)
      .findOne({ _id: "current" });
    if (!doc) return null;

    const { _id, updatedAt, items, ...rest } = doc;

    // Array data stored under `items`
    if (items !== undefined && Object.keys(rest).length === 0) {
      return { data: items, updatedAt };
    }

    // Object data spread at top level
    return { data: rest, updatedAt };
  } catch (error) {
    console.error(
      `[State] ⚠️ Failed to load "${collectionName}": ${error.message}`,
    );
    return null;
  }
}

import type { Document } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ═══════════════════════════════════════════════════════════════
//  Collector State — Per-Collection Persistence
// ═══════════════════════════════════════════════════════════════
// Each data type is stored in its own MongoDB collection.
// Documents are flat — fields at the top level, no `data` wrapper.
//   Objects: { _id: "current", fieldA, fieldB, ..., updatedAt }
//   Arrays:  { _id: "current", items: [...], updatedAt }
// ═══════════════════════════════════════════════════════════════

interface StateDocument extends Document {
  _id: string;
  updatedAt: Date;
  items?: unknown[];
  [key: string]: unknown;
}

/**
 * Save the latest collector state to a dedicated collection.
 * Objects are spread at the top level. Arrays are stored under `items`.
 */
export async function saveState(
  collectionName: string,
  data: unknown[] | Record<string, unknown>,
) {
  try {
    const database = getDatabase();
    const document: StateDocument = Array.isArray(data)
      ? { _id: "current", items: data, updatedAt: new Date() }
      : { _id: "current", ...data, updatedAt: new Date() };

    await database
      .collection<StateDocument>(collectionName)
      .replaceOne({ _id: "current" }, document, { upsert: true });
  } catch (error: unknown) {
    logger.error(
      `[State] ⚠️ Failed to save "${collectionName}": ${errorMessage(error)}`,
    );
  }
}

/**
 * Load the latest state from a dedicated collection.
 * Reconstructs the original payload shape (object or array).
 */
export async function loadState(collectionName: string) {
  try {
    const database = getDatabase();
    const document = await database
      .collection<StateDocument>(collectionName)
      .findOne({ _id: "current" });
    if (!document) return null;

    const { _id, updatedAt, items, ...rest } = document;

    // Array data stored under `items`
    if (items !== undefined && Object.keys(rest).length === 0) {
      return { data: items, updatedAt };
    }

    // Object data spread at top level
    return { data: rest, updatedAt };
  } catch (error: unknown) {
    logger.error(
      `[State] ⚠️ Failed to load "${collectionName}": ${errorMessage(error)}`,
    );
    return null;
  }
}

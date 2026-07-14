import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import { EphemeralStore, errorMessage } from "../utilities.ts";
import { EPHEMERAL_TTL_MS, EPHEMERAL_MAX_SIZE } from "../constants.ts";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface EmbedAssetDocument {
  assetId: string;
  assetType: string;
  data: unknown;
  createdAt: Date;
}

// ─── Collection Setup ───────────────────────────────────────────

let collection: Collection<EmbedAssetDocument> | null = null;

export async function setupEmbedAssetCollection() {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<EmbedAssetDocument>("embed_assets") as unknown as Collection<EmbedAssetDocument>;

  await collectionInstance.createIndex({ assetId: 1 }, { unique: true });
  await collectionInstance.createIndex({ assetType: 1 });
  await collectionInstance.createIndex({ createdAt: -1 });

  collection = collectionInstance;
  logger.info("📦 Embed asset collection indexes ready");
}

// ─── Internal Persistence Operations ────────────────────────────

async function saveEmbedAsset(
  assetId: string,
  assetType: string,
  data: unknown,
): Promise<void> {
  if (!collection) {
    logger.warn("[EmbedAsset] Collection not initialized — asset will not be persisted");
    return;
  }

  await collection.updateOne(
    { assetId },
    {
      $set: { assetType, data, createdAt: new Date() },
    },
    { upsert: true },
  );
}

async function getEmbedAsset<T>(assetId: string): Promise<T | null> {
  if (!collection) {
    logger.warn("[EmbedAsset] Collection not initialized — cannot retrieve asset");
    return null;
  }

  const document = await collection.findOne(
    { assetId },
    { projection: { _id: 0, data: 1 } },
  );

  if (!document) return null;
  return document.data as T;
}

// ─── PersistentStore ────────────────────────────────────────────
// Wraps EphemeralStore with a write-through to MongoDB on set()
// and an async DB fallback on getWithFallback(). The in-memory
// cache serves hot reads instantly; MongoDB ensures assets survive
// server restarts and TTL expiry.

export class PersistentStore<T = unknown> {
  #ephemeral: EphemeralStore<T>;
  #assetType: string;

  constructor(
    assetType: string,
    ttlMs: number = EPHEMERAL_TTL_MS,
    maxSize: number = EPHEMERAL_MAX_SIZE,
  ) {
    this.#ephemeral = new EphemeralStore<T>(ttlMs, maxSize);
    this.#assetType = assetType;
  }

  set(value: T): string {
    const id = this.#ephemeral.set(value);
    saveEmbedAsset(id, this.#assetType, value)
      .catch(error =>
        logger.warn(`[PersistentStore:${this.#assetType}] DB write failed: ${errorMessage(error)}`),
      );
    return id;
  }

  /** Store or replace a value under a stable caller-supplied ID (upsert). */
  setWithId(id: string, value: T): void {
    this.#ephemeral.setWithId(id, value);
    saveEmbedAsset(id, this.#assetType, value)
      .catch(error =>
        logger.warn(`[PersistentStore:${this.#assetType}] DB write failed: ${errorMessage(error)}`),
      );
  }

  get(id: string): T | null {
    return this.#ephemeral.get(id);
  }

  async getWithFallback(id: string): Promise<T | null> {
    const cached = this.#ephemeral.get(id);
    if (cached) return cached;
    return getEmbedAsset<T>(id);
  }
}

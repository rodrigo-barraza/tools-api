import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VideoTrimCacheDocument {
  trimHash: string;
  sourceUrl: string;
  trimStart: string;
  trimEnd: string;
  minioObjectKey: string;
  downloadUrl: string;
  durationSeconds: number | null;
  fileSizeBytes: number;
  mimeType: string;
  format: string;
  cachedAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

// ─── Collection Singleton ────────────────────────────────────────────────────

let collection: Collection<VideoTrimCacheDocument> | null = null;

export async function setupVideoTrimCacheCollection(): Promise<void> {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<VideoTrimCacheDocument>(
    "video_trim_cache",
  ) as unknown as Collection<VideoTrimCacheDocument>;

  await collectionInstance.createIndex({ trimHash: 1 }, { unique: true });
  await collectionInstance.createIndex({ sourceUrl: 1 });
  await collectionInstance.createIndex({ cachedAt: -1 });

  collection = collectionInstance;
  logger.info("✂️  Video trim cache collection indexes ready");
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findVideoTrimCacheEntry(
  trimHash: string,
): Promise<VideoTrimCacheDocument | null> {
  if (!collection) return null;

  const document = await collection.findOneAndUpdate(
    { trimHash },
    {
      $set: { lastAccessedAt: new Date() },
      $inc: { accessCount: 1 },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );

  return document ?? null;
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function upsertVideoTrimCacheEntry(
  entry: Omit<VideoTrimCacheDocument, "cachedAt" | "lastAccessedAt" | "accessCount">,
): Promise<void> {
  if (!collection) {
    logger.warn("[VideoTrimCache] Collection not initialized — cache entry will not be persisted");
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { trimHash: entry.trimHash },
    {
      $set: {
        sourceUrl: entry.sourceUrl,
        trimStart: entry.trimStart,
        trimEnd: entry.trimEnd,
        minioObjectKey: entry.minioObjectKey,
        downloadUrl: entry.downloadUrl,
        durationSeconds: entry.durationSeconds,
        fileSizeBytes: entry.fileSizeBytes,
        mimeType: entry.mimeType,
        format: entry.format,
        lastAccessedAt: now,
      },
      $setOnInsert: {
        cachedAt: now,
        accessCount: 1,
      },
    },
    { upsert: true },
  );
}

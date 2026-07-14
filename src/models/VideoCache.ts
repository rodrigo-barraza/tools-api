import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/service-library/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VideoCacheDocument {
  urlHash: string;
  normalizedUrl: string;
  format: "mp4" | "mp3";
  minioObjectKey: string;
  downloadUrl: string;
  title: string;
  uploader: string;
  channel: string | null;
  platform: string;
  durationSeconds: number | null;
  viewCount: number | null;
  uploadDate: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  fileSizeBytes: number;
  mimeType: string;
  cachedAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

// ─── Collection Singleton ────────────────────────────────────────────────────

let collection: Collection<VideoCacheDocument> | null = null;

export async function setupVideoCacheCollection(): Promise<void> {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<VideoCacheDocument>(
    "video_cache",
  ) as unknown as Collection<VideoCacheDocument>;

  await collectionInstance.createIndex({ urlHash: 1 }, { unique: true });
  await collectionInstance.createIndex({ normalizedUrl: 1 });
  await collectionInstance.createIndex({ cachedAt: -1 });
  await collectionInstance.createIndex({ lastAccessedAt: -1 });

  collection = collectionInstance;
  logger.info("🎬 Video cache collection indexes ready");
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findVideoCacheEntry(
  urlHash: string,
): Promise<VideoCacheDocument | null> {
  if (!collection) return null;

  const document = await collection.findOneAndUpdate(
    { urlHash },
    {
      $set: { lastAccessedAt: new Date() },
      $inc: { accessCount: 1 },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );

  return document ?? null;
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function upsertVideoCacheEntry(
  entry: Omit<VideoCacheDocument, "cachedAt" | "lastAccessedAt" | "accessCount">,
): Promise<void> {
  if (!collection) {
    logger.warn("[VideoCache] Collection not initialized — cache entry will not be persisted");
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { urlHash: entry.urlHash },
    {
      $set: {
        normalizedUrl: entry.normalizedUrl,
        format: entry.format,
        minioObjectKey: entry.minioObjectKey,
        downloadUrl: entry.downloadUrl,
        title: entry.title,
        uploader: entry.uploader,
        channel: entry.channel,
        platform: entry.platform,
        durationSeconds: entry.durationSeconds,
        viewCount: entry.viewCount,
        uploadDate: entry.uploadDate,
        description: entry.description,
        thumbnailUrl: entry.thumbnailUrl,
        fileSizeBytes: entry.fileSizeBytes,
        mimeType: entry.mimeType,
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

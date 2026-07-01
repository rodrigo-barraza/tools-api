import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RedditVideoCacheDocument {
  urlHash: string;
  normalizedUrl: string;
  format: "mp4";
  minioObjectKey: string;
  downloadUrl: string;
  title: string;
  author: string;
  subreddit: string;
  permalink: string;
  isNsfw: boolean;
  durationSeconds: number | null;
  widthPixels: number | null;
  heightPixels: number | null;
  fileSizeBytes: number;
  mimeType: string;
  cachedAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

// ─── Collection Singleton ────────────────────────────────────────────────────

let collection: Collection<RedditVideoCacheDocument> | null = null;

export async function setupRedditVideoCacheCollection(): Promise<void> {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<RedditVideoCacheDocument>(
    "reddit_video_cache",
  ) as unknown as Collection<RedditVideoCacheDocument>;

  await collectionInstance.createIndex({ urlHash: 1 }, { unique: true });
  await collectionInstance.createIndex({ normalizedUrl: 1 });
  await collectionInstance.createIndex({ subreddit: 1 });
  await collectionInstance.createIndex({ cachedAt: -1 });

  collection = collectionInstance;
  logger.info("🟠 Reddit video cache collection indexes ready");
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function findRedditVideoCacheEntry(
  urlHash: string,
): Promise<RedditVideoCacheDocument | null> {
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

export async function upsertRedditVideoCacheEntry(
  entry: Omit<RedditVideoCacheDocument, "cachedAt" | "lastAccessedAt" | "accessCount">,
): Promise<void> {
  if (!collection) {
    logger.warn("[RedditVideoCache] Collection not initialized — cache entry will not be persisted");
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
        author: entry.author,
        subreddit: entry.subreddit,
        permalink: entry.permalink,
        isNsfw: entry.isNsfw,
        durationSeconds: entry.durationSeconds,
        widthPixels: entry.widthPixels,
        heightPixels: entry.heightPixels,
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

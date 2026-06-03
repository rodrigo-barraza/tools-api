import type { Collection } from "mongodb";
import { getDB } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import type { VectorLayer } from "../utilities/VectorAnimationEngine.ts";

export interface VectorAnimationConfig {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  background?: string;
  layers: VectorLayer[];
}

export interface VectorAnimationOptions {
  loop?: boolean;
  autoplay?: boolean;
  title?: string;
  clearSession?: boolean;
}

export interface VectorAnimationDocument {
  animationId: string;
  animation: VectorAnimationConfig;
  options: VectorAnimationOptions;
  sessionId?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let collection: Collection<VectorAnimationDocument> | null = null;

export async function setupVectorAnimationCollection() {
  const database = getDB();
  if (!database) return;

  collection = database.collection<VectorAnimationDocument>("vector_animations");

  await collection.createIndex({ animationId: 1 }, { unique: true });
  await collection.createIndex({ sessionId: 1 });
  await collection.createIndex({ createdAt: -1 });

  logger.info("🎬 Vector animation collection indexes ready");
}

export async function saveVectorAnimation(
  animationId: string,
  animation: VectorAnimationConfig,
  options: VectorAnimationOptions,
  sessionId?: string | null,
  createdBy?: string | null,
): Promise<void> {
  if (!collection) {
    logger.warn("[VectorAnimation] Collection not initialized — animation will not be persisted");
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { animationId },
    {
      $set: {
        animation,
        options,
        sessionId: sessionId || null,
        createdBy: createdBy || null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

export async function getVectorAnimation(
  animationId: string,
): Promise<{ animation: VectorAnimationConfig; options: VectorAnimationOptions } | null> {
  if (!collection) {
    logger.warn("[VectorAnimation] Collection not initialized — cannot retrieve animation");
    return null;
  }

  const document = await collection.findOne(
    { animationId },
    { projection: { _id: 0, animation: 1, options: 1 } },
  );

  if (!document) return null;
  return { animation: document.animation, options: document.options };
}

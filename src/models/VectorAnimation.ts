import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";
import type { VectorLayer, SymbolMap } from "../utilities/VectorAnimationEngine.ts";

export interface VectorAnimationConfig {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  background?: string;
  layers: VectorLayer[];
  symbols?: SymbolMap;
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

export interface VectorAnimationSessionDocument {
  sessionId: string;
  animation: VectorAnimationConfig;
  options: VectorAnimationOptions;
  updatedAt: Date;
}

/** Sessions are the agent's iterative working state — keep them for a week. */
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

let collection: Collection<VectorAnimationDocument> | null = null;
let sessionCollection: Collection<VectorAnimationSessionDocument> | null = null;

export async function setupVectorAnimationCollection() {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<VectorAnimationDocument>("vector_animations") as unknown as Collection<VectorAnimationDocument>;

  await collectionInstance.createIndex({ animationId: 1 }, { unique: true });
  await collectionInstance.createIndex({ sessionId: 1 });
  await collectionInstance.createIndex({ createdAt: -1 });

  collection = collectionInstance;

  const sessionCollectionInstance = database.collection<VectorAnimationSessionDocument>("vector_animation_sessions") as unknown as Collection<VectorAnimationSessionDocument>;
  await sessionCollectionInstance.createIndex({ sessionId: 1 }, { unique: true });
  await sessionCollectionInstance.createIndex(
    { updatedAt: 1 },
    { expireAfterSeconds: SESSION_TTL_SECONDS },
  );
  sessionCollection = sessionCollectionInstance;

  logger.info("🎬 Vector animation collection indexes ready");
}

export async function saveVectorAnimationSession(
  sessionId: string,
  animation: VectorAnimationConfig,
  options: VectorAnimationOptions,
): Promise<void> {
  if (!sessionCollection) return;
  await sessionCollection.updateOne(
    { sessionId },
    { $set: { animation, options, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function getVectorAnimationSession(
  sessionId: string,
): Promise<{ animation: VectorAnimationConfig; options: VectorAnimationOptions } | null> {
  if (!sessionCollection) return null;
  const document = await sessionCollection.findOne(
    { sessionId },
    { projection: { _id: 0, animation: 1, options: 1 } },
  );
  if (!document) return null;
  return { animation: document.animation, options: document.options };
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

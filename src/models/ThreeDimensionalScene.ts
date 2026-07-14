import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────

export type ThreeDimensionalSceneType = "mesh" | "scene" | "model" | "voxel";

export interface ThreeDimensionalSceneDocument {
  sceneId: string;
  sceneType: ThreeDimensionalSceneType;
  sceneData: Record<string, unknown>;
  options: Record<string, unknown>;
  sessionId?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let collection: Collection<ThreeDimensionalSceneDocument> | null = null;

export async function setupThreeDimensionalSceneCollection() {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<ThreeDimensionalSceneDocument>("three_dimensional_scenes") as unknown as Collection<ThreeDimensionalSceneDocument>;

  await collectionInstance.createIndex({ sceneId: 1 }, { unique: true });
  await collectionInstance.createIndex({ sessionId: 1 });
  await collectionInstance.createIndex({ sceneType: 1 });
  await collectionInstance.createIndex({ createdAt: -1 });

  collection = collectionInstance;
  logger.info("🧊 3D scene collection indexes ready");
}

export async function saveThreeDimensionalScene(
  sceneId: string,
  sceneType: ThreeDimensionalSceneType,
  sceneData: Record<string, unknown>,
  options: Record<string, unknown>,
  sessionId?: string | null,
  createdBy?: string | null,
): Promise<void> {
  if (!collection) {
    logger.warn("[ThreeDimensionalScene] Collection not initialized — scene will not be persisted");
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { sceneId },
    {
      $set: {
        sceneType,
        sceneData,
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

export async function getThreeDimensionalScene(
  sceneId: string,
): Promise<{
  sceneType: ThreeDimensionalSceneType;
  sceneData: Record<string, unknown>;
  options: Record<string, unknown>;
} | null> {
  if (!collection) {
    logger.warn("[ThreeDimensionalScene] Collection not initialized — cannot retrieve scene");
    return null;
  }

  const document = await collection.findOne(
    { sceneId },
    { projection: { _id: 0, sceneType: 1, sceneData: 1, options: 1 } },
  );

  if (!document) return null;
  return {
    sceneType: document.sceneType,
    sceneData: document.sceneData,
    options: document.options,
  };
}

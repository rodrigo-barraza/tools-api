import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface TurtleDrawingDocument {
  drawingId: string;
  commands: unknown[];
  options: Record<string, unknown>;
  sessionId?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let collection: Collection<TurtleDrawingDocument> | null = null;

export async function setupTurtleDrawingCollection() {
  const database = getDatabase();
  if (!database) return;

  collection = database.collection<TurtleDrawingDocument>("turtle_drawings");

  await collection.createIndex({ drawingId: 1 }, { unique: true });
  await collection.createIndex({ sessionId: 1 });
  await collection.createIndex({ createdAt: -1 });

  logger.info("🐢 Turtle drawing collection indexes ready");
}

export async function saveTurtleDrawing(
  drawingId: string,
  commands: unknown[],
  options: Record<string, unknown>,
  sessionId?: string | null,
  createdBy?: string | null,
): Promise<void> {
  if (!collection) {
    logger.warn("[TurtleDrawing] Collection not initialized — drawing will not be persisted");
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { drawingId },
    {
      $set: {
        commands,
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

export async function getTurtleDrawing(
  drawingId: string,
): Promise<{ commands: unknown[]; options: Record<string, unknown> } | null> {
  if (!collection) {
    logger.warn("[TurtleDrawing] Collection not initialized — cannot retrieve drawing");
    return null;
  }

  const document = await collection.findOne(
    { drawingId },
    { projection: { _id: 0, commands: 1, options: 1 } },
  );

  if (!document) return null;
  return { commands: document.commands, options: document.options };
}

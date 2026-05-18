import express from "express";
import { fieldProjectionMiddleware } from "../src/middleware/FieldProjectionMiddleware.ts";

/**
 * Creates a minimal Express app for in-process testing (supertest).
 * Mounts the given router at `path` with only essential middleware —
 * no MongoDB, no collectors, no cron.
 *


 */
export function createTestApp(path, router) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(fieldProjectionMiddleware);
  app.use(path, router);
  return app;
}

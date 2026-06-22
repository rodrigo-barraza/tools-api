import express from "express";
import { fieldProjectionMiddleware } from "../src/middleware/FieldProjectionMiddleware.ts";
import { headerPropagationMiddleware } from "../src/middleware/HeaderPropagationMiddleware.ts";

/**
 * Creates a minimal Express app for in-process testing (supertest).
 * Mounts the given router at `path` with only essential middleware —
 * no MongoDB, no collectors, no cron.
 */
export function createTestApp(path: string, router: express.Router): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(fieldProjectionMiddleware);
  app.use(headerPropagationMiddleware);
  app.use(path, router);
  return app;
}

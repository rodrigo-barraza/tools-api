import express from "express";
import { fieldProjectionMiddleware } from "../src/middleware/FieldProjectionMiddleware.ts";
import { createAuthMiddleware } from "@rodrigo-barraza/utilities-library/service";
import { DEFAULT_USERNAME } from "@rodrigo-barraza/utilities-library/taxonomy";

/**
 * Creates a minimal Express app for in-process testing (supertest).
 * Mounts the given router at `path` with only essential middleware —
 * no MongoDB, no collectors, no cron.
 */
export function createTestApp(path: string, router: express.Router): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(fieldProjectionMiddleware);
  app.use(
    createAuthMiddleware({
      defaultUsername: DEFAULT_USERNAME,
      traceContext: true,
    }),
  );
  app.use(path, router);
  return app;
}

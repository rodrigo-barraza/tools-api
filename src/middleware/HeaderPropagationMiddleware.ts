/**
 * HeaderPropagationMiddleware — attaches identity headers to the request object.
 *
 * Reads x-project, x-username, and x-workspace-id from incoming headers and
 * attaches them to `req` so route handlers and services can access them without
 * re-parsing headers on every call.
 *
 * Mirrors Prism's AuthMiddleware pattern.
 */
import type { Request, Response, NextFunction } from "express";

export function headerPropagationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Project: from query param, body, or x-project header
  req.project = (req.query?.project as string) || req.body?.project || (req.headers["x-project"] as string) || "default";

  // Username: from x-username header
  req.username = (req.headers["x-username"] as string) || "anonymous";

  // Workspace ID: optional — null means the default workspace
  req.workspaceId = (req.headers["x-workspace-id"] as string) || null;

  next();
}

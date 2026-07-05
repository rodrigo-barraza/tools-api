import { DEFAULT_USERNAME } from "@rodrigo-barraza/utilities-library/taxonomy";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";

export interface RequestStore {
  workspaceRoot?: string | null;
  workspaceOverride?: string | null;
}

export const requestLocalStorage = new AsyncLocalStorage<RequestStore>();

/**
 * HeaderPropagationMiddleware — attaches identity headers to the request object.
 *
 * Reads x-project, x-username, x-workspace-root, and x-workspace-override
 * from incoming headers and attaches them to `req` so route handlers and
 * services can access them without re-parsing headers on every call.
 *
 * Mirrors Prism's AuthMiddleware pattern.
 */
export function headerPropagationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Project: from query param, body, or x-project header
  req.project =
    (req.query?.project as string) ||
    req.body?.project ||
    (req.headers["x-project"] as string) ||
    "default";

  // Username: from x-username header
  req.username = (req.headers["x-username"] as string) || DEFAULT_USERNAME;

  // Workspace ID: optional — null means the default workspace
  req.workspaceId = (req.headers["x-workspace-id"] as string) || null;

  // Workspace Root: user-selected workspace path from prism-client sidebar.
  // Sent as X-Workspace-Root by prism-service's ToolOrchestratorService.
  req.workspaceRoot = (req.headers["x-workspace-root"] as string) || null;

  // Workspace Override: optional — path to active worktree
  req.workspaceOverride = (req.headers["x-workspace-override"] as string) || null;

  const requestStore: RequestStore = {
    workspaceRoot: req.workspaceRoot,
    workspaceOverride: req.workspaceOverride,
  };

  requestLocalStorage.run(requestStore, () => {
    next();
  });
}


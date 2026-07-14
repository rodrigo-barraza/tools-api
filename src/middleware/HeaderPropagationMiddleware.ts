import { DEFAULT_USERNAME } from "@rodrigo-barraza/utilities-library/taxonomy";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";

export interface RequestStore {
  workspaceRoot?: string | null;
  workspaceOverride?: string | null;
  requestId?: string | null;
  conversationId?: string | null;
  iteration?: string | null;
  project?: string | null;
  username?: string | null;
}

export const requestLocalStorage = new AsyncLocalStorage<RequestStore>();

/**
 * Trace headers for outbound calls made while serving a request (Prism
 * proxies, etc.), so a tool call can be correlated across service hops.
 * Returns an empty object outside a request context.
 */
export function getTraceHeaders(): Record<string, string> {
  const store = requestLocalStorage.getStore();
  if (!store) return {};
  const headers: Record<string, string> = {};
  if (store.requestId) headers["x-request-id"] = store.requestId;
  if (store.conversationId) headers["x-conversation-id"] = store.conversationId;
  if (store.iteration) headers["x-iteration"] = store.iteration;
  if (store.project) headers["x-project"] = store.project;
  if (store.username) headers["x-username"] = store.username;
  return headers;
}

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
    requestId: (req.headers["x-request-id"] as string) || null,
    conversationId: (req.headers["x-conversation-id"] as string) || null,
    iteration: (req.headers["x-iteration"] as string) || null,
    project: req.project,
    username: req.username,
  };

  requestLocalStorage.run(requestStore, () => {
    next();
  });
}


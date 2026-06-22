// ─── Express Request Augmentation ───────────────────────────
// Extends the Express Request interface with properties set by
// HeaderPropagationMiddleware and other middleware.

import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Project identifier (from x-project header or body/query). */
    project: string;
    /** Username (from x-username header). */
    username: string;
    /** Workspace ID (from x-workspace-id header). Null = default. */
    workspaceId: string | null;
    /** Workspace override path for active worktree. */
    workspaceOverride: string | null;
  }

  interface Router {
    handle(req: Request, res: Response, next?: NextFunction): void;
  }
}

export {};

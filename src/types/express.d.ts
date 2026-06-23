// ─── Express Request Augmentation ───────────────────────────
// Extends the Express Request interface with properties set by
// HeaderPropagationMiddleware and other middleware.

import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    project: string;
    username: string;
    workspaceId: string | null;
    workspaceOverride: string | null;
  }
}

export {};

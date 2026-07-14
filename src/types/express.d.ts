// ─── Express Request Augmentation ───────────────────────────
// Extends the Express Request interface with properties set by
// service-library's createAuthMiddleware and other middleware.

import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    project: string;
    username: string;
    clientIp?: string;
    agent?: string | null;
    workspaceId: string | null;
    workspaceRoot: string | null;
    workspaceOverride: string | null;
    requestId?: string | null;
    conversationId?: string | null;
    iteration?: string | null;
  }
}

export {};

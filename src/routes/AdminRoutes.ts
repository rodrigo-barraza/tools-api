import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { Request, Response, Router } from "express";
import { stat } from "node:fs/promises";
import { ObjectId } from "mongodb";
import {
  queryRequestLogs,
  getRequestStats,
} from "../middleware/RequestLoggerMiddleware.ts";
import {
  queryToolCallLogs,
  getToolCallStats,
} from "../middleware/ToolCallLoggerMiddleware.ts";
import {
  getToolSchemas,
  getToolSchemasForAI,
  getDisabledTools,
} from "../services/ToolSchemaService.ts";
import {
  ALLOWED_ROOTS,
  refreshAllowedRoots,
  normalizeWorkspacePath,
} from "../services/AgenticFileService.ts";
import { getConnectedAgents, registerRemoteOnlyRoot } from "../services/AgentConnectionManager.ts";
import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

const router = Router();
// ─── Path Translation ─────────────────────────────────────────────
const WORKSPACE_COLLECTION = "workspace_config";
/**
 * Detect whether a path is Windows-style.
 */
function isWindowsPath(path: string) {
  return /^[A-Za-z]:[/\\]/.test(path);
}
/**
 * Resolve a user-supplied path to a host-native absolute path.
 * Windows paths are translated to WSL mount paths on Linux hosts.
 * POSIX paths are resolved as-is.
 */
function resolveWorkspacePath(rawPath: string) {
  return normalizeWorkspacePath(rawPath);
}
// ─── Tool Schema Endpoints ────────────────────────────────────────
/**
 * GET /admin/tool-schemas
 * Full tool schemas with endpoint metadata for dynamic clients.
 */
router.get("/tool-schemas", (req: Request, res: Response) => {
  const locale = (req.query.locale as string) || undefined;
  res.json(getToolSchemas(locale));
});
/**
 * GET /admin/tool-schemas/ai
 * Clean schemas for LLM consumption (no endpoint metadata).
 */
router.get("/tool-schemas/ai", (req: Request, res: Response) => {
  const locale = (req.query.locale as string) || undefined;
  res.json(getToolSchemasForAI(locale));
});
/**
 * GET /admin/tool-schemas/disabled
 * Tools hidden because their required API keys are not configured.
 */
router.get("/tool-schemas/disabled", (_req: Request, res: Response) => {
  res.json(getDisabledTools());
});
// ─── Request Log Endpoints ─────────────────────────────────────────
/**
 * GET /admin/requests
 * Query persisted request logs with optional filters.
 * Query params: method, path, status, minStatus, maxStatus,
 *               since, until, limit, skip
 */
router.get(
  "/requests",
  asyncHandler(
    (req: Request) => queryRequestLogs(req.query),
    "Request log query",
    500,
  ),
);
/**
 * GET /admin/requests/stats
 * Aggregated request statistics.
 * Query params: since (ISO date for time window)
 */
router.get(
  "/requests/stats",
  asyncHandler(
    (req: Request) => getRequestStats(req.query.since as string),
    "Request stats",
    500,
  ),
);
// ─── Tool Call Telemetry Endpoints ─────────────────────────────────
/**
 * GET /admin/tool-calls
 * Query tool-call-level telemetry logs with optional filters.
 * Query params: toolName, domain, success, callerAgent, callerProject, callerRequestId,
 *               minMs, maxMs, since, until, limit, skip
 */
router.get(
  "/tool-calls",
  asyncHandler(
    (req: Request) => queryToolCallLogs(req.query),
    "Tool call log query",
    500,
  ),
);
router.get(
  "/tool-calls/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const databaseInstance = getDatabase();
    let queryObjectId: ObjectId;
    try {
      queryObjectId = new ObjectId(req.params.id as string);
    } catch {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const toolCallDocument = await databaseInstance.collection("tool_calls").findOne({ _id: queryObjectId });
    if (!toolCallDocument) {
      return res.status(404).json({ error: "Tool call not found" });
    }
    res.json(toolCallDocument);
  }, "Tool call detail", 500)
);
/**
 * GET /admin/tool-calls/stats
 * Aggregated tool-call performance statistics.
 * Returns per-tool latency metrics, domain breakdowns, error rates,
 * and the top 10 slowest tool invocations.
 * Query params: since (ISO date for time window)
 */
router.get(
  "/tool-calls/stats",
  asyncHandler(
    (req: Request) => getToolCallStats(req.query.since as string),
    "Tool call stats",
    500,
  ),
);
// ─── Config Endpoint ──────────────────────────────────────────────
/**
 * GET /admin/config
 * Exposes workspace configuration so downstream services (Prism)
 * can fetch it at startup instead of duplicating in their secrets.
 */
router.get("/config", (_req: Request, res: Response) => {
  const agents = getConnectedAgents();
  res.json({
    workspaceRoots: ALLOWED_ROOTS,
    agents,
  });
});
/**
 * PUT /admin/config/workspaces
 * Update user-configured workspace roots.
 * Validates each path (must be absolute, must exist on disk).
 *
 * Body: { roots: string[] }
 */
router.put(
  "/config/workspaces",
  asyncHandler(async (req: Request, res: Response) => {
    const { roots } = req.body || {};
    if (!Array.isArray(roots)) {
      return res
        .status(400)
        .json({ error: "'roots' must be an array of path strings" });
    }
    const errors: { path: string; resolved?: string; error: string }[] = [];
    const validRoots: string[] = [];
    for (const rawPath of roots) {
      const resolved = resolveWorkspacePath(rawPath);
      if (!resolved) {
        errors.push({ path: rawPath, error: "Invalid or empty path" });
        continue;
      }
      // Must be absolute
      if (!resolved.startsWith("/")) {
        errors.push({
          path: rawPath,
          resolved,
          error: "Path must be absolute",
        });
        continue;
      }
      // Must exist on disk
      try {
        const statResult = await stat(resolved);
        if (!statResult.isDirectory()) {
          errors.push({
            path: rawPath,
            resolved,
            error: "Path exists but is not a directory",
          });
          continue;
        }
      } catch {
        errors.push({
          path: rawPath,
          resolved,
          error: "Directory does not exist",
        });
        continue;
      }
      if (!validRoots.includes(resolved)) {
        validRoots.push(resolved);
      }
    }
    // Persist to MongoDB
    const database = getDatabase();
    const collection = database.collection(WORKSPACE_COLLECTION);
    await collection.updateOne(
      { _key: "user_roots" },
      {
        $set: {
          roots: validRoots,
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          _key: "user_roots",
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
    // Refresh in-memory ALLOWED_ROOTS
    refreshAllowedRoots(validRoots);
    res.json({
      workspaceRoots: ALLOWED_ROOTS,
      userRoots: validRoots,
      errors: errors.length > 0 ? errors : undefined,
    });
  }),
);
/**
 * POST /admin/config/workspaces/validate
 * Validate a single workspace path without persisting.
 * Useful for live input validation in the UI.
 *
 * Body: { path: string }
 */
router.post(
  "/config/workspaces/validate",
  asyncHandler(async (req: Request, res: Response) => {
    const { path: rawPath } = req.body || {};
    if (!rawPath || typeof rawPath !== "string") {
      return res.status(400).json({ error: "'path' is required (string)" });
    }
    const isWindows = isWindowsPath(rawPath.trim());
    const resolved = resolveWorkspacePath(rawPath);
    if (!resolved) {
      return res.json({
        valid: false,
        error: "Could not resolve path",
        originalPath: rawPath,
      });
    }
    if (!resolved.startsWith("/")) {
      return res.json({
        valid: false,
        error: "Path must be absolute",
        resolvedPath: resolved,
        originalPath: rawPath,
        isWsl: isWindows,
      });
    }
    // Check if already registered
    const alreadyRegistered = ALLOWED_ROOTS.includes(resolved);
    // Check disk existence
    let exists = false;
    let isDirectory = false;
    try {
      const statResult = await stat(resolved);
      exists = true;
      isDirectory = statResult.isDirectory();
    } catch {
      // does not exist
    }
    res.json({
      valid: exists && isDirectory && !alreadyRegistered,
      resolvedPath: resolved,
      originalPath: rawPath,
      isWsl: isWindows,
      exists,
      isDirectory,
      alreadyRegistered,
      error: !exists
        ? "Directory does not exist"
        : !isDirectory
          ? "Path is not a directory"
          : alreadyRegistered
            ? "Already registered as a workspace"
            : undefined,
    });
  }),
);
/**
 * Load user-configured workspace roots from MongoDB and merge into ALLOWED_ROOTS.
 * Re-normalizes stored paths through the cross-platform resolver so any stale
 * Windows paths (e.g. `C:\workspace` stored before WSL translation was added)
 * get corrected to their WSL mount equivalents for this run.
 * Called at boot time from server.js.
 */
export async function loadUserWorkspaceRoots() {
  try {
    const database = getDatabase();
    const collection = database.collection(WORKSPACE_COLLECTION);
    const document = await collection.findOne({ _key: "user_roots" });
    if (
      document &&
      Array.isArray(document.roots) &&
      document.roots.length > 0
    ) {
      const normalizedRoots = document.roots
        .map((storedPath: string) => normalizeWorkspacePath(storedPath))
        .filter((resolvedPath: string | null): resolvedPath is string => resolvedPath !== null);

      // Only advertise LOCAL execution for roots that actually exist on this
      // host. A configured root that is absent here (e.g. /workspace living on
      // a user's machine) can only be served by a workspace agent — register
      // it as remote-only so ops error with "agent offline" instead of falling
      // back to local EACCES/ENOENT (the S1 production error storm).
      const localRoots: string[] = [];
      for (const root of normalizedRoots) {
        let isLocalDirectory = false;
        try {
          isLocalDirectory = (await stat(root)).isDirectory();
        } catch {
          // absent on this host
        }
        if (isLocalDirectory) {
          localRoots.push(root);
        } else {
          registerRemoteOnlyRoot(root);
          logger.warn(
            `   📂 Workspace root '${root}' does not exist on this host — treating as remote-only (requires its workspace agent to be connected)`,
          );
        }
      }

      refreshAllowedRoots(localRoots);
      logger.info(`   📂 User workspace roots (local): ${localRoots.join(", ") || "(none)"}`);
    }
  } catch (error: unknown) {
    logger.warn(
      `   ⚠️  Could not load user workspace roots: ${errorMessage(error)}`,
    );
  }
}
export default router;

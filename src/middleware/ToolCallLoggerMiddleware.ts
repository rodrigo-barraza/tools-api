// ─── Tool Call Logger Middleware ────────────────────────────

import { performance } from "node:perf_hooks";
import type { Request, Response, NextFunction } from "express";
import logger from "../logger.ts";
import { getDB } from "@rodrigo-barraza/utilities-library/mongo";
import { getToolSchemas } from "../services/ToolSchemaService.ts";
import { errorMessage } from "../utilities.ts";

const COLLECTION = "tool_calls";

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

interface ToolEntry {
  toolName: string;
  domain: string;
  method?: string;
}

interface ToolCallLogEntry {
  toolName: string;
  domain: string;
  method: string;
  path: string;
  status: number;
  success: boolean;
  errorMessage: string | null;
  elapsedMs: number;
  inBytes: number;
  outBytes: number;
  args: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  callerProject: string | null;
  callerUsername: string | null;
  callerAgent: string | null;
  callerRequestId: string | null;
  callerConversationId: string | null;
  callerIteration: number | null;
  clientIp: string;
  timestamp: Date;
}

interface ToolCallFilters {
  toolName?: string;
  domain?: string;
  success?: string | boolean;
  callerAgent?: string;
  callerProject?: string;
  callerRequestId?: string;
  callerConversationId?: string;
  minMs?: string;
  maxMs?: string;
  since?: string;
  until?: string;
  limit?: string;
  skip?: string;
}

interface AggregateDoc {
  _id: string | boolean;
  count: number;
  avgMs?: number;
  maxMs?: number;
  minMs?: number;
  errors?: number;
  totalBytes?: number;
}

// ────────────────────────────────────────────────────────────
// Reverse Map: HTTP path -> { toolName, domain }
// ────────────────────────────────────────────────────────────
// Built lazily on first request and refreshed periodically
// in case tool definitions change at runtime.

// Map: path -> { toolName, domain, method }
let pathToToolMap = new Map<string, ToolEntry>();
let lastMapBuild = 0;
const MAP_REBUILD_INTERVAL_MS = 60_000; // Rebuild every 60s

/**
 * Normalize a path template to a regex-ish key for matching.
 * Strips :param segments to just a pattern prefix.
 * e.g. "/weather/live" stays "/weather/live"
 *      "/finance/stock/:symbol/quote" becomes "/finance/stock/STAR/quote"
 */
function normalizePathTemplate(pathTemplate: string): string {
  return pathTemplate.replace(/:[^/]+/g, "*");
}

/**
 * Normalize an actual request path to match against templates.
 * Replaces path segments that look like dynamic values.
 */
function normalizeRequestPath(actualPath: string): string {
  // Strip query string
  const clean = actualPath.split("?")[0];
  return clean;
}

/**
 * Build the reverse path → tool map from ToolSchemaService.
 */
function rebuildPathMap() {
  const schemas = getToolSchemas();
  const newMap = new Map<string, ToolEntry>();

  for (const schema of schemas) {
    if (!schema.endpoint?.path) continue;
    const key = normalizePathTemplate(schema.endpoint.path);
    newMap.set(key, {
      toolName: schema.name,
      domain: schema.domain || "Other",
      method: schema.endpoint.method || "GET",
    });
  }

  pathToToolMap = newMap;
  lastMapBuild = Date.now();
}

/**
 * Resolve a request to its tool metadata.
 */
function resolveToolFromRequest(
  method: string,
  path: string,
): ToolEntry | null {
  // Rebuild map periodically
  if (Date.now() - lastMapBuild > MAP_REBUILD_INTERVAL_MS) {
    rebuildPathMap();
  }

  const cleanPath = normalizeRequestPath(path);

  // Direct match first (most common — non-parameterized routes)
  if (pathToToolMap.has(cleanPath)) {
    const entry = pathToToolMap.get(cleanPath)!;
    if (!entry.method || entry.method === method) {
      return entry;
    }
  }

  // Parameterized match — replace path segments with * and try
  for (const [pattern, entry] of pathToToolMap) {
    if (!pattern.includes("*")) continue;
    if (entry.method && entry.method !== method) continue;

    // Build regex from pattern
    const regexString =
      "^" + pattern.replace(/\*/g, "[^/]+").replace(/\//g, "\\/") + "$";

    if (new RegExp(regexString).test(cleanPath)) {
      return entry;
    }
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// Middleware
// ────────────────────────────────────────────────────────────

/**
 * Express middleware that logs tool-call-level telemetry.
 * Intercepts responses, identifies which tool was called,
 * and persists structured telemetry to MongoDB.
 */
export function toolCallLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = performance.now();

  // Capture the response body by monkey-patching res.json
  const originalJson = res.json.bind(res);
  let responseBody: Record<string, unknown> | null = null;

  res.json = (data: unknown) => {
    responseBody = data as Record<string, unknown>;
    return originalJson(data);
  };

  res.on("finish", () => {
    const elapsed = performance.now() - start;
    const method = req.method;
    const path = req.originalUrl;
    const status = res.statusCode;

    // Skip non-tool routes (admin, health checks, etc.)
    const bodyMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
    if (!bodyMethods.has(method)) return;

    // Skip admin and internal endpoints
    if (path.startsWith("/admin")) return;
    if (path === "/health") return;

    const tool = resolveToolFromRequest(method, path);
    if (!tool) return;

    // Extract caller context from headers (sent by Prism/Prism Client)
    const callerProject = (req.headers["x-project"] as string) || null;
    const callerUsername = (req.headers["x-username"] as string) || null;
    const callerAgent = (req.headers["x-agent"] as string) || null;
    const callerRequestId = (req.headers["x-request-id"] as string) || null;
    const callerConversationId =
      (req.headers["x-conversation-id"] as string) || null;
    const callerIteration = req.headers["x-iteration"]
      ? parseInt(req.headers["x-iteration"] as string, 10)
      : null;
    const clientIp =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ||
      req.ip ||
      "unknown";

    // Request / response sizes
    const inBytes = parseInt(req.headers["content-length"] || "0", 10);
    const outBytes = parseInt(
      String(res.getHeader("content-length") || "0"),
      10,
    );

    // Determine success from status code AND response body
    const success = status >= 200 && status < 400 && !responseBody?.error;
    const errorMessage = (responseBody?.error as string) || null;

    // Sanitize args — strip large payloads to keep docs lean
    const hasBody = method !== "GET";
    const args = sanitizeArgs(hasBody ? req.body : req.query);

    // Sanitize result — keep shape info but cap size
    const result = sanitizeResult(responseBody);

    // Persist (fire-and-forget)
    persistToolCall({
      toolName: tool.toolName,
      domain: tool.domain,
      method,
      path: path.split("?")[0],
      status,
      success,
      errorMessage,

      // Performance
      elapsedMs: Math.round(elapsed * 100) / 100,
      inBytes,
      outBytes,

      // Args & Result
      args,
      result,

      // Caller context
      callerProject,
      callerUsername,
      callerAgent,
      callerRequestId,
      callerConversationId,
      callerIteration,
      clientIp,

      timestamp: new Date(),
    }).catch(() => {});
  });

  next();
}

// ────────────────────────────────────────────────────────────
// Sanitization — keep docs lean
// ────────────────────────────────────────────────────────────

const MAX_ARG_LENGTH = 500;
const MAX_RESULT_ITEMS = 3;

/**
 * Sanitize tool arguments for storage. Caps long strings,
 * strips base64 data, keeps structure readable.
 */
function sanitizeArgs(
  args: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return args;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > MAX_ARG_LENGTH) {
      sanitized[key] =
        value.slice(0, MAX_ARG_LENGTH) + `… [${value.length} chars]`;
    } else if (typeof value === "string" && value.startsWith("data:")) {
      sanitized[key] = "[base64 data]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Sanitize the response body for storage. Keeps metadata
 * (count, total, etc.) but truncates large arrays/objects.
 */
function sanitizeResult(
  body: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return body;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      result[key] = {
        _type: "array",
        _count: value.length,
        _sample: value.slice(0, MAX_RESULT_ITEMS),
      };
    } else if (key === "error") {
      result[key] = value;
    } else if (typeof value === "object" && value !== null) {
      // Keep shallow objects, but cap nested arrays
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
        if (Array.isArray(nv)) {
          nested[nk] = { _type: "array", _count: nv.length };
        } else {
          nested[nk] = nv;
        }
      }
      result[key] = nested;
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────
// Persistence
// ────────────────────────────────────────────────────────────

/**
 * Persist a tool-call log entry to MongoDB.
 */
export async function persistToolCall(entry: ToolCallLogEntry) {
  try {
    const database = getDB();
    await database.collection(COLLECTION).insertOne(entry);
  } catch {
    // Silently fail — logging should never break the app
  }
}

// ────────────────────────────────────────────────────────────
// Query API — consumed by AdminRoutes
// ────────────────────────────────────────────────────────────

/**
 * Query tool-call logs with optional filters.
 */
export async function queryToolCallLogs(filters: ToolCallFilters = {}) {
  const database = getDB();
  const query: Record<string, unknown> = {};

  if (filters.toolName) query.toolName = filters.toolName;
  if (filters.domain) query.domain = filters.domain;
  if (filters.success !== undefined)
    query.success = filters.success === "true" || filters.success === true;
  if (filters.callerAgent) query.callerAgent = filters.callerAgent;
  if (filters.callerProject) query.callerProject = filters.callerProject;
  if (filters.callerRequestId) query.callerRequestId = filters.callerRequestId;
  if (filters.callerConversationId) query.callerConversationId = filters.callerConversationId;

  if (filters.minMs || filters.maxMs) {
    query.elapsedMs = {};
    if (filters.minMs)
      (query.elapsedMs as Record<string, number>).$gte = parseFloat(
        filters.minMs,
      );
    if (filters.maxMs)
      (query.elapsedMs as Record<string, number>).$lte = parseFloat(
        filters.maxMs,
      );
  }

  if (filters.since || filters.until) {
    query.timestamp = {};
    if (filters.since)
      (query.timestamp as Record<string, Date>).$gte = new Date(filters.since);
    if (filters.until)
      (query.timestamp as Record<string, Date>).$lte = new Date(filters.until);
  }

  const limit = parseInt(filters.limit || "100", 10);
  const skip = parseInt(filters.skip || "0", 10);

  const [toolCalls, total] = await Promise.all([
    database
      .collection(COLLECTION)
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    database.collection(COLLECTION).countDocuments(query),
  ]);

  return { total, count: toolCalls.length, toolCalls };
}

/**
 * Get aggregated tool-call statistics.
 */
export async function getToolCallStats(since?: string) {
  const database = getDB();
  const match = since ? { timestamp: { $gte: new Date(since) } } : {};

  const [totalCalls, byTool, byDomain, bySuccess, slowest, errorRate] =
    await Promise.all([
      // Total count
      database.collection(COLLECTION).countDocuments(match),

      // By tool name — count + avg/p95/max latency
      database
        .collection(COLLECTION)
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: "$toolName",
              count: { $sum: 1 },
              avgMs: { $avg: "$elapsedMs" },
              maxMs: { $max: "$elapsedMs" },
              minMs: { $min: "$elapsedMs" },
              errors: {
                $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] },
              },
              totalBytes: { $sum: { $add: ["$inBytes", "$outBytes"] } },
            },
          },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      // By domain
      database
        .collection(COLLECTION)
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: "$domain",
              count: { $sum: 1 },
              avgMs: { $avg: "$elapsedMs" },
              errors: {
                $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] },
              },
            },
          },
          { $sort: { count: -1 } },
        ])
        .toArray(),

      // Success vs failure breakdown
      database
        .collection(COLLECTION)
        .aggregate([
          { $match: match },
          { $group: { _id: "$success", count: { $sum: 1 } } },
        ])
        .toArray(),

      // Top 10 slowest calls
      database
        .collection(COLLECTION)
        .find(match)
        .sort({ elapsedMs: -1 })
        .limit(10)
        .project({
          toolName: 1,
          domain: 1,
          elapsedMs: 1,
          success: 1,
          errorMessage: 1,
          callerAgent: 1,
          timestamp: 1,
        })
        .toArray(),

      // Error rate per tool (only tools with errors)
      database
        .collection(COLLECTION)
        .aggregate([
          { $match: { ...match, success: false } },
          {
            $group: {
              _id: "$toolName",
              errorCount: { $sum: 1 },
              lastError: { $last: "$errorMessage" },
              lastErrorAt: { $max: "$timestamp" },
            },
          },
          { $sort: { errorCount: -1 } },
        ])
        .toArray(),
    ]);

  const successMap = Object.fromEntries(
    bySuccess.map((s) => [
      (s as AggregateDoc)._id ? "success" : "failure",
      (s as AggregateDoc).count,
    ]),
  );

  return {
    totalCalls,
    successRate:
      totalCalls > 0
        ? Math.round(((successMap.success || 0) / totalCalls) * 10000) / 100
        : 0,
    byTool: byTool.map((tool) => ({
      toolName: (tool as AggregateDoc)._id,
      count: (tool as AggregateDoc).count,
      avgMs: Math.round(((tool as AggregateDoc).avgMs || 0) * 100) / 100,
      maxMs: Math.round(((tool as AggregateDoc).maxMs || 0) * 100) / 100,
      minMs: Math.round(((tool as AggregateDoc).minMs || 0) * 100) / 100,
      errors: (tool as AggregateDoc).errors || 0,
      errorRate:
        (tool as AggregateDoc).count > 0
          ? Math.round(
              (((tool as AggregateDoc).errors || 0) /
                (tool as AggregateDoc).count) *
                10000,
            ) / 100
          : 0,
      totalTransferBytes: (tool as AggregateDoc).totalBytes || 0,
    })),
    byDomain: byDomain.map((domain) => ({
      domain: (domain as AggregateDoc)._id,
      count: (domain as AggregateDoc).count,
      avgMs: Math.round(((domain as AggregateDoc).avgMs || 0) * 100) / 100,
      errors: (domain as AggregateDoc).errors || 0,
    })),
    breakdown: successMap,
    slowest,
    errorsByTool: errorRate,
  };
}

// ────────────────────────────────────────────────────────────
// Collection Setup — indexes for efficient querying
// ────────────────────────────────────────────────────────────

/**
 * Create indexes on the tool_calls collection.
 * Called during server startup alongside other model setups.
 */
export async function setupToolCallsCollection() {
  try {
    const database = getDB();
    const collection = database.collection(COLLECTION);

    await Promise.all([
      collection.createIndex({ timestamp: -1 }),
      collection.createIndex({ toolName: 1, timestamp: -1 }),
      collection.createIndex({ domain: 1, timestamp: -1 }),
      collection.createIndex({ success: 1, timestamp: -1 }),
      collection.createIndex({ callerAgent: 1, timestamp: -1 }),
      collection.createIndex({ elapsedMs: -1 }),
      collection.createIndex({ callerRequestId: 1, timestamp: -1 }),
      collection.createIndex({ callerConversationId: 1, timestamp: -1 }),
    ]);

    logger.info(`📊 tool_calls collection indexes ensured`);
  } catch (error: unknown) {
    logger.error(`Failed to setup tool_calls indexes: ${errorMessage(error)}`);
  }
}

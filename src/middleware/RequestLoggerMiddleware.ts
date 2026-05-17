import { performance } from "node:perf_hooks";
import { formatBytes } from "@rodrigo-barraza/utilities-library";
import logger from "../logger.ts";
import { getDB } from "../db.ts";

const COLLECTION = "requests";

/**
 * Express middleware that logs every completed request to:
 *   1. Console — method, path, status, timing, transfer sizes
 *   2. MongoDB — persisted for admin analytics / debugging
 *
 * Modeled after Prism's RequestLoggerMiddleware, without
 * token/cost tracking (not applicable for a data API).
 */
export function requestLoggerMiddleware(req, res, next) {
  const start = performance.now();

  res.on("finish", () => {
    const elapsed = performance.now() - start;
    const method = req.method;
    const path = req.originalUrl;
    const status = res.statusCode;
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;

    // Format timing
    const time =
      elapsed >= 1000
        ? `${(elapsed / 1000).toFixed(2)}s`
        : `${Math.round(elapsed)}ms`;

    // Request / response sizes (from headers — zero-cost)
    const inBytes = parseInt(req.headers["content-length"] || "0", 10);
    const outBytes = parseInt(res.getHeader("content-length") || "0", 10);
    const totalBytes = inBytes + outBytes;
    const sizeTag = `(in: ${formatBytes(inBytes)}, out: ${formatBytes(outBytes)}, total: ${formatBytes(totalBytes)})`;

    // Console log
    logger.request(method, path, status, time, sizeTag);

    // Persist to MongoDB (fire-and-forget)
    persistRequest({
      method,
      path,
      status,
      clientIp,
      elapsedMs: Math.round(elapsed * 100) / 100,
      inBytes,
      outBytes,
    }).catch(() => {});
  });

  next();
}

/**
 * Persist a request log entry to MongoDB.

 */
async function persistRequest(entry) {
  try {
    const db = getDB();
    await db.collection(COLLECTION).insertOne({
      ...entry,
      timestamp: new Date(),
    });
  } catch {
    // Silently fail — logging should never break the app
  }
}

/**
 * Query persisted request logs with optional filters.


 * @returns {Promise<{ count: number, requests: object[] }>}
 */
export async function queryRequestLogs(filters: Record<string, any> = {}) {
  const db = getDB();
  const query: Record<string, any> = {};

  if (filters.method) query.method = filters.method.toUpperCase();
  if (filters.path) query.path = { $regex: `^${filters.path}` };
  if (filters.status) query.status = parseInt(filters.status, 10);
  if (filters.minStatus || filters.maxStatus) {
    query.status = query.status || {};
    if (filters.minStatus) query.status.$gte = parseInt(filters.minStatus, 10);
    if (filters.maxStatus) query.status.$lte = parseInt(filters.maxStatus, 10);
  }
  if (filters.since || filters.until) {
    query.timestamp = {};
    if (filters.since) query.timestamp.$gte = new Date(filters.since);
    if (filters.until) query.timestamp.$lte = new Date(filters.until);
  }

  const limit = parseInt(filters.limit || "100", 10);
  const skip = parseInt(filters.skip || "0", 10);

  const [requests, total] = await Promise.all([
    db
      .collection(COLLECTION)
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION).countDocuments(query),
  ]);

  return { total, count: requests.length, requests };
}

/**
 * Get aggregated request stats.


 */
export async function getRequestStats(since) {
  const db = getDB();
  const match = since ? { timestamp: { $gte: new Date(since) } } : {};

  const [totalRequests, byStatus, byMethod, byDomain] = await Promise.all([
    db.collection(COLLECTION).countDocuments(match),
    db
      .collection(COLLECTION)
      .aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    db
      .collection(COLLECTION)
      .aggregate([
        { $match: match },
        { $group: { _id: "$method", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    db
      .collection(COLLECTION)
      .aggregate([
        { $match: match },
        {
          $addFields: {
            domain: {
              $arrayElemAt: [
                { $split: [{ $ltrim: { input: "$path", chars: "/" } }, "/"] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: "$domain",
            count: { $sum: 1 },
            avgMs: { $avg: "$elapsedMs" },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray(),
  ]);

  return {
    totalRequests,
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    byMethod: Object.fromEntries(byMethod.map((m) => [m._id, m.count])),
    byDomain: byDomain.map((d) => ({
      domain: d._id,
      count: d.count,
      avgMs: Math.round(d.avgMs * 100) / 100,
    })),
  };
}

// ────────────────────────────────────────────────────────────
// Collection Setup — indexes for efficient querying
// ────────────────────────────────────────────────────────────

/**
 * Create indexes on the requests collection.
 * Called during server startup alongside other model setups.
 */
export async function setupRequestsCollection() {
  try {
    const db = getDB();
    const col = db.collection(COLLECTION);

    await Promise.all([
      col.createIndex({ timestamp: -1 }),
      col.createIndex({ method: 1, timestamp: -1 }),
      col.createIndex({ status: 1, timestamp: -1 }),
      col.createIndex({ path: 1, timestamp: -1 }),
    ]);

    logger.info(`📊 requests collection indexes ensured`);
  } catch (error) {
    logger.error(`Failed to setup requests indexes: ${error.message}`);
  }
}

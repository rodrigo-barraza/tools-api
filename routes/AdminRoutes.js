import { Router } from "express";
import {
  queryRequestLogs,
  getRequestStats,
} from "../middleware/RequestLoggerMiddleware.js";

const router = Router();

// ─── Request Log Endpoints ─────────────────────────────────────────

/**
 * GET /admin/requests
 * Query persisted request logs with optional filters.
 * Query params: method, path, status, minStatus, maxStatus,
 *               since, until, limit, skip
 */
router.get("/requests", async (req, res) => {
  try {
    const result = await queryRequestLogs(req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/requests/stats
 * Aggregated request statistics.
 * Query params: since (ISO date for time window)
 */
router.get("/requests/stats", async (req, res) => {
  try {
    const stats = await getRequestStats(req.query.since);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

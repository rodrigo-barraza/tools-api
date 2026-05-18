import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { Router } from "express";
import CONFIG from "../config.js";
import {
  getEventsToday,
  getEventsUpcoming,
  getEventsPast,
  searchEvents,
  getEventBySourceId,
} from "../models/Event.js";
import {
  getLatestEvents,
  getEventSummary,
  getHealth,
} from "../caches/EventCache.js";
const router = Router();
// ─── Event Endpoints ───────────────────────────────────────────────
router.get("/today", asyncHandler(async (_req: any, res: any) => {
  const events = await getEventsToday(CONFIG.TIMEZONE);
  res.json({ count: events.length, timezone: CONFIG.TIMEZONE, events });
}));
router.get("/upcoming", asyncHandler(async (req: any, res: any) => {
  const days = parseIntParam(req.query.days as string, 30);
  const limit = parseIntParam(req.query.limit as string, 200);
  const events = await getEventsUpcoming(days, limit);
  res.json({ count: events.length, days, events });
}));
router.get("/past", asyncHandler(async (req: any, res: any) => {
  const days = parseIntParam(req.query.days as string, 30);
  const limit = parseIntParam(req.query.limit as string, 200);
  const events = await getEventsPast(days, limit);
  res.json({ count: events.length, days, events });
}));
router.get("/search", asyncHandler(async (req: any, res: any) => {
  const { q, category, city, source } = req.query as any;
  const limit = parseIntParam(req.query.limit as string, 100);
  const events = await searchEvents({ q, category, city, source, limit });
  res.json({
    count: events.length,
    query: { q, category, city, source },
    events,
  });
}));
router.get("/summary", (_req: any, res: any) => {
  res.json(getEventSummary());
});
router.get("/cached", (_req: any, res: any) => {
  const events = getLatestEvents();
  res.json({ count: events.length, events });
});
router.get("/:source/:id", asyncHandler(async (req: any, res: any) => {
  const event = await getEventBySourceId(req.params.source as string, req.params.id as string);
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json(event);
}));
// ── Unified Events Dispatcher ──────────────────────────────────────
router.get("/events", asyncHandler(async (req: any, res: any) => {
  const { action, q, source, category, days, limit: rawLimit } = req.query as any;
  if (!action) return res.status(400).json({ error: "'action' is required", actions: ["search", "upcoming", "today", "summary"] });
  // @ts-expect-error - suppress remaining error
  const limit = parseIntParam(rawLimit, undefined);
  switch (action) {
    case "search": {
      const events = await searchEvents({ q, category, source, limit: limit || 100 });
      return res.json({ action, count: events.length, query: { q, category, source }, events });
    }
    case "upcoming": {
      const daysAhead = parseIntParam(days, 30);
      const events = await getEventsUpcoming(daysAhead, limit || 200);
      return res.json({ action, count: events.length, days: daysAhead, events });
    }
    case "today": {
      const events = await getEventsToday(CONFIG.TIMEZONE);
      return res.json({ action, count: events.length, timezone: CONFIG.TIMEZONE, events });
    }
    case "summary":
      return res.json({ action, ...getEventSummary() });
    default:
      return res.status(400).json({ error: `Unknown action: ${action}`, actions: ["search", "upcoming", "today", "summary"] });
  }
}));
// ─── Domain Health ─────────────────────────────────────────────────
export function getEventHealth() {
  return getHealth();
}
export default router;

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

router.get("/today", async (_req, res) => {
  const events = await getEventsToday(CONFIG.TIMEZONE);
  res.json({ count: events.length, timezone: CONFIG.TIMEZONE, events });
});

router.get("/upcoming", async (req, res) => {
  const days = parseInt(req.query.days || "30", 10);
  const limit = parseInt(req.query.limit || "200", 10);
  const events = await getEventsUpcoming(days, limit);
  res.json({ count: events.length, days, events });
});

router.get("/past", async (req, res) => {
  const days = parseInt(req.query.days || "30", 10);
  const limit = parseInt(req.query.limit || "200", 10);
  const events = await getEventsPast(days, limit);
  res.json({ count: events.length, days, events });
});

router.get("/search", async (req, res) => {
  const { q, category, city, source } = req.query;
  const limit = parseInt(req.query.limit || "100", 10);
  const events = await searchEvents({ q, category, city, source, limit });
  res.json({
    count: events.length,
    query: { q, category, city, source },
    events,
  });
});

router.get("/summary", (_req, res) => {
  res.json(getEventSummary());
});

router.get("/cached", (_req, res) => {
  const events = getLatestEvents();
  res.json({ count: events.length, events });
});

router.get("/:source/:id", async (req, res) => {
  const event = await getEventBySourceId(req.params.source, req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json(event);
});

// ─── Domain Health ─────────────────────────────────────────────────

export function getEventHealth() {
  return getHealth();
}

export default router;

import { Request, Response, Router } from "express";
import {
  getTrackedVessels,
  getVesselByMmsi,
  getRecentMessages,
  getVesselsInArea,
  searchVessels,
  getAisStreamHealth,
} from "../fetchers/maritime/AisStreamFetcher.ts";

const router = Router();

// ─── Tracked Vessels (latest known state per MMSI) ─────────────────

router.get("/vessels", (_req: Request, res: Response) => {
  const limit = parseInt(_req.query.limit as string, 10) || 100;
  const vessels = getTrackedVessels(limit);
  res.json({ count: vessels.length, vessels });
});

// ─── Vessel by MMSI ────────────────────────────────────────────────

router.get("/vessels/:mmsi", (req: Request, res: Response) => {
  const mmsi = parseInt(req.params.mmsi as string, 10);
  const vessel = getVesselByMmsi(mmsi);
  if (!vessel) {
    return res
      .status(404)
      .json({
        error: `Vessel MMSI ${req.params.mmsi as string} not found in buffer`,
      });
  }
  res.json(vessel);
});

// ─── Vessel Search ─────────────────────────────────────────────────

router.get("/search", (req: Request, res: Response) => {
  const { q: query, limit } = req.query as Record<string, string | undefined>;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const results = searchVessels(query, parseInt(limit || "", 10) || 20);
  res.json({ query: query, count: results.length, vessels: results });
});

// ─── Vessels in Area ───────────────────────────────────────────────

router.get("/area", (req: Request, res: Response) => {
  const { minLat, maxLat, minLng, maxLng, limit } = req.query as Record<
    string,
    string | undefined
  >;
  if (!minLat || !maxLat || !minLng || !maxLng) {
    return res
      .status(400)
      .json({
        error: "Parameters minLat, maxLat, minLng, maxLng are required",
      });
  }
  const vessels = getVesselsInArea(
    parseFloat(minLat),
    parseFloat(maxLat),
    parseFloat(minLng),
    parseFloat(maxLng),
    parseInt(limit || "", 10) || 100,
  );
  res.json({ count: vessels.length, vessels });
});

// ─── Recent Messages (raw stream buffer) ───────────────────────────

router.get("/messages", (req: Request, res: Response) => {
  const { limit, type } = req.query as Record<string, string | undefined>;
  const messages = getRecentMessages(
    parseInt(limit || "", 10) || 50,
    type || null,
  );
  res.json({ count: messages.length, messages });
});

// ─── Health ────────────────────────────────────────────────────────

export function getMaritimeHealth() {
  return {
    aisStream: getAisStreamHealth(),
  };
}

export default router;

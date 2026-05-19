import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
import CONFIG from "../config.ts";
import {
  getNextBus,
  getStopInfo,
  findStopsNearby,
  getRouteInfo,
} from "../fetchers/transit/TransLinkFetcher.ts";
const router = Router();
// ─── Next Bus ──────────────────────────────────────────────────────
router.get("/nextbus/:stopNo", asyncHandler(async (req: Request, res: Response) => {
  const stopNo = parseInt(req.params.stopNo as string, 10);
  if (isNaN(stopNo)) {
    return res.status(400).json({ error: "Invalid stop number" });
  }
  res.json(await getNextBus(stopNo, req.query.route as string));
}));
// ─── Stop Info ─────────────────────────────────────────────────────
router.get("/stops/:stopNo", asyncHandler(async (req: Request, res: Response) => {
  const stopNo = parseInt(req.params.stopNo as string, 10);
  if (isNaN(stopNo)) {
    return res.status(400).json({ error: "Invalid stop number" });
  }
  res.json(await getStopInfo(stopNo));
}));
// ─── Find Nearby Stops ────────────────────────────────────────────
router.get("/stops/nearby", asyncHandler(
  (req: Request) => {
    const lat = parseFloat(req.query.lat as string || String(CONFIG.LATITUDE));
    const lng = parseFloat(req.query.lng as string || String(CONFIG.LONGITUDE));
    const radius = parseIntParam(req.query.radius as string, 500);
    return findStopsNearby(lat, lng, radius);
  },
  "Nearby stops",
));
// ─── Route Info ────────────────────────────────────────────────────
router.get("/routes/:routeNo", asyncHandler(
  (req: Request) => getRouteInfo(req.params.routeNo as string),
  "Route info",
));
// ─── Health ────────────────────────────────────────────────────────
export function getTransitHealth() {
  return {
    translink: CONFIG.TRANSLINK_API_KEY ? "ready" : "no-api-key",
  };
}
export default router;

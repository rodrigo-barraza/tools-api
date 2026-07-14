// ─── Analytics Routes ───────────────────────────────────────
// Agent-facing endpoint for unified web analytics across the
// user's own web properties. Merges Google Analytics (GA4) and the
// first-party sessions-service, both reached through portal-service,
// joined per property so each site is reported once.

import { Router, Request, Response } from "express";
import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import {
  getWebAnalytics,
  isAnalyticsConfigured,
  VALID_PERIODS,
  VALID_SOURCES,
  VALID_BREAKDOWNS,
  type AnalyticsPeriod,
  type AnalyticsSource,
  type AnalyticsBreakdown,
} from "../fetchers/analytics/WebAnalyticsFetcher.ts";

const router = Router();

// ─── GET /analytics/web ─────────────────────────────────────────
// Query: property? (filter to one site), period (7d|30d|90d),
//        source (all|google|firstParty), breakdown
//        (overview|timeseries|pages|sources|geo|devices)

router.get(
  "/web",
  asyncHandler(async (request: Request, response: Response) => {
    const property = request.query.property as string | undefined;
    const period = (request.query.period as string | undefined) ?? "30d";
    const source = (request.query.source as string | undefined) ?? "all";
    const breakdown =
      (request.query.breakdown as string | undefined) ?? "overview";

    if (!VALID_PERIODS.includes(period as AnalyticsPeriod)) {
      return response.status(400).json({
        error: `Invalid period: ${period}`,
        validPeriods: VALID_PERIODS,
      });
    }
    if (!VALID_SOURCES.includes(source as AnalyticsSource)) {
      return response.status(400).json({
        error: `Invalid source: ${source}`,
        validSources: VALID_SOURCES,
      });
    }
    if (!VALID_BREAKDOWNS.includes(breakdown as AnalyticsBreakdown)) {
      return response.status(400).json({
        error: `Invalid breakdown: ${breakdown}`,
        validBreakdowns: VALID_BREAKDOWNS,
      });
    }

    const data = await getWebAnalytics({
      property,
      period: period as AnalyticsPeriod,
      source: source as AnalyticsSource,
      breakdown: breakdown as AnalyticsBreakdown,
    });

    response.json(data);
  }, "Analytics_Web"),
);

// ─── Health Export ──────────────────────────────────────────────

export function getAnalyticsHealth() {
  return {
    portalService: isAnalyticsConfigured()
      ? "configured"
      : "not configured (PORTAL_SERVICE_URL missing)",
  };
}

export default router;

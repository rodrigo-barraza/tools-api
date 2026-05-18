import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Router } from "express";
import { fetchLiveWeather } from "../fetchers/weather/LiveWeatherFetcher.ts";
import {
  getRecentEarthquakes,
  getEarthquakeById,
} from "../models/Earthquake.ts";
import { getRecentNeos } from "../models/Neo.ts";
import { getRecentSolarFlares } from "../models/SolarFlare.ts";
import { getRecentCmes } from "../models/Cme.ts";
import { getRecentStorms } from "../models/GeomagneticStorm.ts";
import {
  getLatest,
  getCurrent,
  getForecasts,
  getAirQuality,
  getDaylight,
  getHealth as getWeatherCacheHealth,
} from "../caches/WeatherCache.ts";
import {
  getLatestEarthquakes,
  getEarthquakeSummary,
  getEarthquakeHealth,
} from "../caches/EarthquakeCache.ts";
import {
  getLatestNeos,
  getNeoSummary,
  getNeoHealth,
} from "../caches/NeoCache.ts";
import {
  getLatestSpaceWeather,
  getLatestFlares,
  getLatestCmes,
  getLatestStorms,
  getSpaceWeatherSummary,
  getSpaceWeatherHealth,
} from "../caches/SpaceWeatherCache.ts";
import {
  getIssData,
  getIssTrajectory,
  getIssHealth,
} from "../caches/IssCache.ts";
import {
  getKpHistory,
  getCurrentKp,
  getKpHealth,
} from "../caches/KpIndexCache.ts";
import {
  getWildfires,
  getWildfireSummary,
  getWildfireHealth,
} from "../caches/WildfireCache.ts";
import { getTides, getNextTide, getTideHealth } from "../caches/TideCache.ts";
import {
  getSolarWind,
  getSolarWindLatest,
  getSolarWindHealth,
} from "../caches/SolarWindCache.ts";
import {
  getGoogleAirQuality,
  getGoogleAirQualityHealth,
} from "../caches/GoogleAirQualityCache.ts";
import {
  getPollen,
  getPollenToday,
  getPollenHealth,
} from "../caches/PollenCache.ts";
import { getApod, getApodHealth } from "../caches/ApodCache.ts";
import {
  getLaunches,
  getNextLaunch,
  getLaunchSummary,
  getLaunchHealth,
} from "../caches/LaunchCache.ts";
import { getTwilight, getTwilightHealth } from "../caches/TwilightCache.ts";
import {
  getWarnings,
  getWarningCount,
  getWarningHealth,
} from "../caches/EnvironmentCanadaCache.ts";
import { getAvalanche, getAvalancheHealth } from "../caches/AvalancheCache.ts";
const router = Router();
// ─── Weather ───────────────────────────────────────────────────────
router.get("/weather", (_req: any, res: any) => res.json(getLatest()));
router.get("/weather/current", (_req: any, res: any) => res.json(getCurrent()));
router.get("/weather/forecast", (_req: any, res: any) => res.json(getForecasts()));
router.get("/weather/air", (_req: any, res: any) => res.json(getAirQuality()));
router.get("/weather/daylight", (_req: any, res: any) => res.json(getDaylight()));
// ─── Earthquakes ───────────────────────────────────────────────────
router.get("/earthquakes", (_req: any, res: any) => res.json(getLatestEarthquakes()));
router.get("/earthquakes/summary", (_req: any, res: any) =>
  res.json(getEarthquakeSummary()),
);
router.get("/earthquakes/recent", asyncHandler(async (req: any, res: any) => {
  const hours = parseIntParam(req.query.hours as string, 24);
  const minMag = req.query.minMag as string ? parseFloat(req.query.minMag as string) : null;
  const limit = parseIntParam(req.query.limit as string, 100);
  res.json(await getRecentEarthquakes(hours, minMag, limit));
}));
router.get("/earthquakes/:id", asyncHandler(async (req: any, res: any) => {
  const event = await getEarthquakeById(req.params.id as string);
  if (!event) return res.status(404).json({ error: "Earthquake not found" });
  res.json(event);
}));
// ─── NEO ───────────────────────────────────────────────────────────
router.get("/neo", (_req: any, res: any) => res.json(getLatestNeos()));
router.get("/neo/summary", (_req: any, res: any) => res.json(getNeoSummary()));
router.get("/neo/recent", asyncHandler(async (req: any, res: any) => {
  const days = parseIntParam(req.query.days as string, 7);
  const hazardousOnly = req.query.hazardousOnly as string === "true";
  const limit = parseIntParam(req.query.limit as string, 100);
  res.json(await getRecentNeos(days, hazardousOnly, limit));
}));
// ─── Space Weather ─────────────────────────────────────────────────
router.get("/space-weather", (_req: any, res: any) => res.json(getLatestSpaceWeather()));
router.get("/space-weather/flares", (_req: any, res: any) => res.json(getLatestFlares()));
router.get("/space-weather/flares/recent", asyncHandler(async (req: any, res: any) => {
  const days = parseIntParam(req.query.days as string, 7);
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(await getRecentSolarFlares(days, limit));
}));
router.get("/space-weather/cmes", (_req: any, res: any) => res.json(getLatestCmes()));
router.get("/space-weather/cmes/recent", asyncHandler(async (req: any, res: any) => {
  const days = parseIntParam(req.query.days as string, 7);
  const earthDirectedOnly = req.query.earthDirected as string === "true";
  const limit = parseIntParam(req.query.limit as string, 50);
  res.json(await getRecentCmes(days, earthDirectedOnly, limit));
}));
router.get("/space-weather/storms", (_req: any, res: any) => res.json(getLatestStorms()));
router.get("/space-weather/storms/recent", asyncHandler(async (req: any, res: any) => {
  const days = parseIntParam(req.query.days as string, 30);
  const limit = parseIntParam(req.query.limit as string, 20);
  res.json(await getRecentStorms(days, limit));
}));
router.get("/space-weather/summary", (_req: any, res: any) =>
  res.json(getSpaceWeatherSummary()),
);
// ─── ISS ───────────────────────────────────────────────────────────
router.get("/iss", (_req: any, res: any) => res.json(getIssData()));
router.get("/iss/trajectory", (_req: any, res: any) => res.json(getIssTrajectory()));
// ─── Kp Index ──────────────────────────────────────────────────────
router.get("/kp", (_req: any, res: any) => res.json(getKpHistory()));
router.get("/kp/current", (_req: any, res: any) => res.json(getCurrentKp()));
// ─── Wildfires ─────────────────────────────────────────────────────
router.get("/wildfires", (_req: any, res: any) => res.json(getWildfires()));
router.get("/wildfires/summary", (_req: any, res: any) => res.json(getWildfireSummary()));
// ─── Tides ─────────────────────────────────────────────────────────
router.get("/tides", (_req: any, res: any) => res.json(getTides()));
router.get("/tides/next", (_req: any, res: any) => res.json(getNextTide()));
// ─── Solar Wind ────────────────────────────────────────────────────
router.get("/solar-wind", (_req: any, res: any) => res.json(getSolarWind()));
router.get("/solar-wind/latest", (_req: any, res: any) => res.json(getSolarWindLatest()));
// ─── Air Quality & Pollen ──────────────────────────────────────────
router.get("/airquality/google", (_req: any, res: any) =>
  res.json(getGoogleAirQuality()),
);
router.get("/pollen", (_req: any, res: any) => res.json(getPollen()));
router.get("/pollen/today", (_req: any, res: any) => res.json(getPollenToday()));
// ─── APOD ──────────────────────────────────────────────────────────
router.get("/apod", (_req: any, res: any) => res.json(getApod()));
// ─── Launches ──────────────────────────────────────────────────────
router.get("/launches", (_req: any, res: any) => res.json(getLaunches()));
router.get("/launches/next", (_req: any, res: any) => res.json(getNextLaunch()));
router.get("/launches/summary", (_req: any, res: any) => res.json(getLaunchSummary()));
// ─── Twilight ──────────────────────────────────────────────────────
router.get("/twilight", (_req: any, res: any) => res.json(getTwilight()));
// ─── Environment Canada ────────────────────────────────────────────
router.get("/warnings", (_req: any, res: any) => res.json(getWarnings()));
router.get("/warnings/count", (_req: any, res: any) => res.json(getWarningCount()));
// ─── Avalanche ─────────────────────────────────────────────────────
router.get("/avalanche", (_req: any, res: any) => res.json(getAvalanche()));
// ── Live Weather (on-demand, any location) ────────────────────────
router.get("/live", asyncHandler(async (req: any, res: any) => {
  const { location, latitude, longitude, units } = req.query as any;
  if (!location && (latitude == null || longitude == null)) {
    return res.status(400).json({
      error: "Query parameter 'location' (city name) or 'latitude' + 'longitude' are required",
      examples: [
        "/weather/live?location=Tokyo",
        "/weather/live?location=Paris,FR",
        "/weather/live?latitude=48.8566&longitude=2.3522",
        "/weather/live?location=New+York&units=imperial",
      ],
    });
  }
  try {
    const result = await fetchLiveWeather({
      location,
      latitude: latitude != null ? parseFloat(latitude) : undefined,
      longitude: longitude != null ? parseFloat(longitude) : undefined,
      units: units || "metric",
    });
    if ((result as any).error) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: `Weather fetch failed: ${error.message}` });
  }
}));
// ── Unified Environment Dispatcher ─────────────────────────────────
const SOURCE_MAP = {
  current_weather: () => getCurrent(),
  air_quality: () => getAirQuality(),
  earthquakes: () => getLatestEarthquakes(),
  solar_activity: () => getSpaceWeatherSummary(),
  aurora: () => getCurrentKp(),
  twilight: () => getTwilight(),
  tides: () => getTides(),
  wildfires: () => getWildfires(),
  iss: () => getIssData(),
  neo: () => getNeoSummary(),
  solar_wind: () => getSolarWindLatest(),
  pollen: () => getPollenToday(),
  apod: () => getApod(),
  launches: () => getLaunchSummary(),
  warnings: () => getWarnings(),
  air_quality_google: () => getGoogleAirQuality(),
};
router.get("/environment", (req: any, res: any) => {
  const { source } = req.query as any;
  if (!source) {
    return res.status(400).json({
      error: "Query parameter 'source' is required",
      availableSources: Object.keys(SOURCE_MAP),
    });
  }
  // @ts-expect-error - TS7053: implicit any index
  const handler = SOURCE_MAP[source];
  if (!handler) {
    return res.status(400).json({
      error: `Unknown source: ${source}`,
      availableSources: Object.keys(SOURCE_MAP),
    });
  }
  const data = handler();
  res.json({ source, ...data });
});
// ─── Domain Health ─────────────────────────────────────────────────
export function getWeatherHealth() {
  return {
    weather: getWeatherCacheHealth(),
    earthquake: getEarthquakeHealth(),
    neo: getNeoHealth(),
    spaceWeather: getSpaceWeatherHealth(),
    iss: getIssHealth(),
    kpIndex: getKpHealth(),
    wildfire: getWildfireHealth(),
    tide: getTideHealth(),
    solarWind: getSolarWindHealth(),
    googleAirQuality: getGoogleAirQualityHealth(),
    pollen: getPollenHealth(),
    apod: getApodHealth(),
    launches: getLaunchHealth(),
    twilight: getTwilightHealth(),
    environmentCanada: getWarningHealth(),
    avalanche: getAvalancheHealth(),
  };
}
export default router;

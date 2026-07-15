import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
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
import { fetchEnvironmentCanadaWarnings } from "../fetchers/weather/EnvironmentCanadaFetcher.ts";
import { getAvalanche, getAvalancheHealth } from "../caches/AvalancheCache.ts";
import { fetchAvalancheForecast } from "../fetchers/weather/AvalancheFetcher.ts";
import { getMoonPhase, getMoonPhaseHealth } from "../caches/MoonPhaseCache.ts";
import { buildDisplay, errorMessage } from "../utilities.ts";
import MinioService from "../services/MinioService.ts";

const router = Router();
// ─── Weather ───────────────────────────────────────────────────────
router.get("/weather", (_req: Request, res: Response) => res.json(getLatest()));
router.get("/weather/current", (_req: Request, res: Response) =>
  res.json(getCurrent()),
);
router.get("/weather/forecast", (_req: Request, res: Response) =>
  res.json(getForecasts()),
);
router.get("/weather/air", (_req: Request, res: Response) =>
  res.json(getAirQuality()),
);
router.get("/weather/daylight", (_req: Request, res: Response) =>
  res.json(getDaylight()),
);
// ─── Earthquakes ───────────────────────────────────────────────────
router.get("/earthquakes", (_req: Request, res: Response) =>
  res.json(getLatestEarthquakes()),
);
router.get("/earthquakes/summary", (_req: Request, res: Response) =>
  res.json(getEarthquakeSummary()),
);
router.get(
  "/earthquakes/recent",
  asyncHandler(async (req: Request, res: Response) => {
    const hours = parseIntParam(req.query.hours as string, 24);
    const minMag = (req.query.minMag as string)
      ? parseFloat(req.query.minMag as string)
      : null;
    const limit = parseIntParam(req.query.limit as string, 100);
    res.json(await getRecentEarthquakes(hours, minMag, limit));
  }),
);
router.get(
  "/earthquakes/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const event = await getEarthquakeById(String(req.params.id));
    if (!event) return res.status(404).json({ error: "Earthquake not found" });
    res.json(event);
  }),
);
// ─── NEO ───────────────────────────────────────────────────────────
router.get("/neo", (_req: Request, res: Response) => res.json(getLatestNeos()));
router.get("/neo/summary", (_req: Request, res: Response) =>
  res.json(getNeoSummary()),
);
router.get(
  "/neo/recent",
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseIntParam(req.query.days as string, 7);
    const hazardousOnly = (req.query.hazardousOnly as string) === "true";
    const limit = parseIntParam(req.query.limit as string, 100);
    res.json(await getRecentNeos(days, hazardousOnly, limit));
  }),
);
// ─── Space Weather ─────────────────────────────────────────────────
router.get("/space-weather", (_req: Request, res: Response) =>
  res.json(getLatestSpaceWeather()),
);
router.get("/space-weather/flares", (_req: Request, res: Response) =>
  res.json(getLatestFlares()),
);
router.get(
  "/space-weather/flares/recent",
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseIntParam(req.query.days as string, 7);
    const limit = parseIntParam(req.query.limit as string, 50);
    res.json(await getRecentSolarFlares(days, limit));
  }),
);
router.get("/space-weather/cmes", (_req: Request, res: Response) =>
  res.json(getLatestCmes()),
);
router.get(
  "/space-weather/cmes/recent",
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseIntParam(req.query.days as string, 7);
    const earthDirectedOnly = (req.query.earthDirected as string) === "true";
    const limit = parseIntParam(req.query.limit as string, 50);
    res.json(await getRecentCmes(days, earthDirectedOnly, limit));
  }),
);
router.get("/space-weather/storms", (_req: Request, res: Response) =>
  res.json(getLatestStorms()),
);
router.get(
  "/space-weather/storms/recent",
  asyncHandler(async (req: Request, res: Response) => {
    const days = parseIntParam(req.query.days as string, 30);
    const limit = parseIntParam(req.query.limit as string, 20);
    res.json(await getRecentStorms(days, limit));
  }),
);
router.get("/space-weather/summary", (_req: Request, res: Response) =>
  res.json(getSpaceWeatherSummary()),
);
// ─── ISS ───────────────────────────────────────────────────────────
router.get("/iss", (_req: Request, res: Response) => res.json(getIssData()));
router.get("/iss/trajectory", (_req: Request, res: Response) =>
  res.json(getIssTrajectory()),
);
// ─── Kp Index ──────────────────────────────────────────────────────
router.get("/kp", (_req: Request, res: Response) => res.json(getKpHistory()));
router.get("/kp/current", (_req: Request, res: Response) =>
  res.json(getCurrentKp()),
);
// ─── Wildfires ─────────────────────────────────────────────────────
router.get("/wildfires", (_req: Request, res: Response) =>
  res.json(getWildfires()),
);
router.get("/wildfires/summary", (_req: Request, res: Response) =>
  res.json(getWildfireSummary()),
);
// ─── Tides ─────────────────────────────────────────────────────────
router.get("/tides", (_req: Request, res: Response) => res.json(getTides()));
router.get("/tides/next", (_req: Request, res: Response) =>
  res.json(getNextTide()),
);
// ─── Solar Wind ────────────────────────────────────────────────────
router.get("/solar-wind", (_req: Request, res: Response) =>
  res.json(getSolarWind()),
);
router.get("/solar-wind/latest", (_req: Request, res: Response) =>
  res.json(getSolarWindLatest()),
);
// ─── Air Quality & Pollen ──────────────────────────────────────────
router.get("/airquality/google", (_req: Request, res: Response) =>
  res.json(getGoogleAirQuality()),
);
router.get("/pollen", (_req: Request, res: Response) => res.json(getPollen()));
router.get("/pollen/today", (_req: Request, res: Response) =>
  res.json(getPollenToday()),
);
// ─── APOD ──────────────────────────────────────────────────────────
router.get("/apod", (_req: Request, res: Response) => {
  const apod = getApod();
  const url = apod.url as string | undefined;
  if (!url) return res.json(apod);
  const title = (apod.title as string) || "Astronomy Picture of the Day";
  // Video days carry a YouTube/Vimeo embed URL — frame it; image days
  // display the standard-resolution image (hdUrl stays in the result).
  const display =
    apod.mediaType === "video"
      ? buildDisplay("embed", url, { height: 420, title })
      : buildDisplay("image", url, { title });
  res.json({ ...apod, display });
});
// ─── Launches ──────────────────────────────────────────────────────
router.get("/launches", (_req: Request, res: Response) =>
  res.json(getLaunches()),
);
router.get("/launches/next", (_req: Request, res: Response) =>
  res.json(getNextLaunch()),
);
router.get("/launches/summary", (_req: Request, res: Response) =>
  res.json(getLaunchSummary()),
);
// ─── Twilight ──────────────────────────────────────────────────────
router.get("/twilight", (_req: Request, res: Response) =>
  res.json(getTwilight()),
);
// ─── Environment Canada ────────────────────────────────────────────
router.get(
  "/warnings",
  asyncHandler(async (req: Request, res: Response) => {
    const regionCode = req.query.regionCode as string | undefined;
    if (regionCode) {
      const warnings = await fetchEnvironmentCanadaWarnings(regionCode);
      return res.json({
        count: warnings.length,
        regionCode,
        warnings,
        lastFetch: new Date().toISOString(),
      });
    }
    res.json(getWarnings());
  }),
);
router.get("/warnings/count", (_req: Request, res: Response) =>
  res.json(getWarningCount()),
);
// ─── Avalanche ─────────────────────────────────────────────────────
router.get(
  "/avalanche",
  asyncHandler(async (req: Request, res: Response) => {
    const region = req.query.region as string | undefined;
    if (region) {
      const forecasts = await fetchAvalancheForecast(region);
      return res.json({
        count: forecasts.length,
        region,
        forecasts,
        lastFetch: new Date().toISOString(),
      });
    }
    res.json(getAvalanche());
  }),
);
// ─── Moon Phase ────────────────────────────────────────────────────
router.get("/moon-phase", (_req: Request, res: Response) =>
  res.json(getMoonPhase()),
);
// ── Live Weather (on-demand, any location) ────────────────────────
router.get(
  "/live",
  asyncHandler(async (req: Request, res: Response) => {
    const { location, latitude, longitude, units } = req.query as Record<
      string,
      string | undefined
    >;
    if (!location && (latitude == null || longitude == null)) {
      return res.status(400).json({
        error:
          "Query parameter 'location' (city name) or 'latitude' + 'longitude' are required",
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
        units: units === "imperial" || units === "metric" ? units : undefined,
      });
      if (result && typeof result === "object" && "error" in result) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (error: unknown) {
      res
        .status(500)
        .json({ error: `Weather fetch failed: ${errorMessage(error)}` });
    }
  }),
);
// ── Unified Environment Dispatcher ─────────────────────────────────
const SOURCE_MAP: Record<string, () => unknown> = {
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
  moon_phase: () => getMoonPhase(),
};
router.get("/environment", (req: Request, res: Response) => {
  const { source } = req.query as Record<string, string | undefined>;
  if (!source) {
    return res.status(400).json({
      error: "Query parameter 'source' is required",
      availableSources: Object.keys(SOURCE_MAP),
    });
  }
  const handler = SOURCE_MAP[source];
  if (!handler) {
    return res.status(400).json({
      error: `Unknown source: ${source}`,
      availableSources: Object.keys(SOURCE_MAP),
    });
  }
  const data = handler();
  res.json({ source, ...(data as Record<string, unknown>) });
});
// ─── Domain Health ─────────────────────────────────────────────────
interface WeatherDomainHealth {
  weather: ReturnType<typeof getWeatherCacheHealth>;
  earthquake: ReturnType<typeof getEarthquakeHealth>;
  neo: ReturnType<typeof getNeoHealth>;
  spaceWeather: ReturnType<typeof getSpaceWeatherHealth>;
  iss: ReturnType<typeof getIssHealth>;
  kpIndex: ReturnType<typeof getKpHealth>;
  wildfire: ReturnType<typeof getWildfireHealth>;
  tide: ReturnType<typeof getTideHealth>;
  solarWind: ReturnType<typeof getSolarWindHealth>;
  googleAirQuality: ReturnType<typeof getGoogleAirQualityHealth>;
  pollen: ReturnType<typeof getPollenHealth>;
  apod: ReturnType<typeof getApodHealth>;
  launches: ReturnType<typeof getLaunchHealth>;
  twilight: ReturnType<typeof getTwilightHealth>;
  environmentCanada: ReturnType<typeof getWarningHealth>;
  avalanche: ReturnType<typeof getAvalancheHealth>;
  moonPhase: ReturnType<typeof getMoonPhaseHealth>;
}
export function getWeatherHealth(): WeatherDomainHealth {
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
    moonPhase: getMoonPhaseHealth(),
  };
}
// ─── Satellite Imagery (NASA Earth) ────────────────────────────────
import {
  getSatelliteImagery,
  getSatelliteAssets,
} from "../fetchers/weather/SatelliteImageryFetcher.ts";
import CONFIG from "../config.ts";

router.get(
  "/satellite",
  asyncHandler(async (req: Request, res: Response) => {
    if (!CONFIG.NASA_API_KEY) {
      return res.status(400).json({ error: "NASA_API_KEY not configured" });
    }
    const {
      action,
      latitude,
      longitude,
      date,
      dimension,
      startDate,
      endDate,
    } = req.query as Record<string, string | undefined>;
    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "'latitude' and 'longitude' are required",
      });
    }
    const parsedLatitude = parseFloat(latitude);
    const parsedLongitude = parseFloat(longitude);
    if (action === "assets") {
      res.json(
        await getSatelliteAssets(
          parsedLatitude,
          parsedLongitude,
          CONFIG.NASA_API_KEY,
          startDate,
          endDate,
        ),
      );
    } else {
      const imagery = await getSatelliteImagery(
        parsedLatitude,
        parsedLongitude,
        CONFIG.NASA_API_KEY,
        date,
        dimension ? parseFloat(dimension) : undefined,
      );
      // NASA returns a signed, short-lived Google-hosted URL — re-host
      // to MinIO so the image survives past the signature expiry. Fall
      // back to the ephemeral URL if the re-host fails.
      let imageUrl = imagery.imageUrl;
      try {
        const imageResponse = await fetch(imagery.imageUrl, {
          signal: AbortSignal.timeout(30_000),
        });
        if (imageResponse.ok) {
          const contentType =
            imageResponse.headers.get("content-type") || "image/png";
          const hostedUrl = await MinioService.uploadToolAsset(
            Buffer.from(await imageResponse.arrayBuffer()),
            contentType,
          );
          if (hostedUrl) imageUrl = hostedUrl;
        }
      } catch {
        // keep the ephemeral NASA URL
      }
      res.json({
        ...imagery,
        imageUrl,
        display: buildDisplay("image", imageUrl, {
          title: `Satellite imagery (${imagery.date})`,
        }),
      });
    }
  }),
);
export default router;

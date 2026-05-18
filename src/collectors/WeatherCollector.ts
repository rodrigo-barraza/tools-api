import {
  OPEN_METEO_INTERVAL_MS,
  AIR_QUALITY_INTERVAL_MS,
  TOMORROWIO_REALTIME_INTERVAL_MS,
  TOMORROWIO_FORECAST_INTERVAL_MS,
  EARTHQUAKE_INTERVAL_MS,
  NEO_INTERVAL_MS,
  DONKI_INTERVAL_MS,
  ISS_POSITION_INTERVAL_MS,
  ISS_ASTROS_INTERVAL_MS,
  KP_INDEX_INTERVAL_MS,
  WILDFIRE_INTERVAL_MS,
  TIDE_INTERVAL_MS,
  SOLAR_WIND_INTERVAL_MS,
  GOOGLE_AIR_QUALITY_INTERVAL_MS,
  GOOGLE_POLLEN_INTERVAL_MS,
  APOD_INTERVAL_MS,
  LAUNCH_INTERVAL_MS,
  TWILIGHT_INTERVAL_MS,
  ENV_CANADA_INTERVAL_MS,
  AVALANCHE_INTERVAL_MS,
} from "../constants.ts";
import { fetchOpenMeteoWeather } from "../fetchers/weather/OpenMeteoFetcher.ts";
import { fetchAirQuality } from "../fetchers/weather/AirQualityFetcher.ts";
import {
  fetchTomorrowIORealtime,
  fetchTomorrowIODailyForecast,
} from "../fetchers/weather/TomorrowIOFetcher.ts";
import { fetchEarthquakes } from "../fetchers/weather/EarthquakeFetcher.ts";
import { fetchNeos } from "../fetchers/weather/NeoFetcher.ts";
import { fetchAllDonki } from "../fetchers/weather/DonkiFetcher.ts";
import {
  fetchIssPosition,
  fetchAstronauts,
} from "../fetchers/weather/IssFetcher.ts";
import { fetchKpIndex } from "../fetchers/weather/KpIndexFetcher.ts";
import { fetchWildfires } from "../fetchers/weather/WildfireFetcher.ts";
import { fetchTides } from "../fetchers/weather/TideFetcher.ts";
import { fetchSolarWind } from "../fetchers/weather/SolarWindFetcher.ts";
import { fetchGoogleAirQuality } from "../fetchers/weather/GoogleAirQualityFetcher.ts";
import { fetchApod } from "../fetchers/weather/ApodFetcher.ts";
import { fetchUpcomingLaunches } from "../fetchers/weather/LaunchFetcher.ts";
import { fetchTwilight } from "../fetchers/weather/TwilightFetcher.ts";
import { fetchEnvironmentCanadaWarnings } from "../fetchers/weather/EnvironmentCanadaFetcher.ts";
import { fetchAvalancheForecast } from "../fetchers/weather/AvalancheFetcher.ts";
import { fetchPollen } from "../fetchers/weather/GooglePollenFetcher.ts";
import { update, restore, setError } from "../caches/WeatherCache.ts";
import {
  updateEarthquakes,
  restoreEarthquakes,
  setEarthquakeError,
} from "../caches/EarthquakeCache.ts";
import { updateNeos, restoreNeos, setNeoError } from "../caches/NeoCache.ts";
import {
  updateSpaceWeather,
  restoreSpaceWeather,
  setSpaceWeatherError,
} from "../caches/SpaceWeatherCache.ts";
import {
  updateIssPosition,
  setIssPositionError,
  updateAstronauts,
  setAstronautsError,
} from "../caches/IssCache.ts";
import { updateKpIndex, setKpIndexError } from "../caches/KpIndexCache.ts";
import { updateWildfires, setWildfireError } from "../caches/WildfireCache.ts";
import { updateTides, setTideError } from "../caches/TideCache.ts";
import {
  updateSolarWind,
  setSolarWindError,
} from "../caches/SolarWindCache.ts";
import {
  updateGoogleAirQuality,
  setGoogleAirQualityError,
} from "../caches/GoogleAirQualityCache.ts";
import { updatePollen, setPollenError } from "../caches/PollenCache.ts";
import { updateApod, setApodError } from "../caches/ApodCache.ts";
import { updateLaunches, setLaunchError } from "../caches/LaunchCache.ts";
import { updateTwilight, setTwilightError } from "../caches/TwilightCache.ts";
import {
  updateWarnings,
  setWarningError,
} from "../caches/EnvironmentCanadaCache.ts";
import {
  updateAvalanche,
  setAvalancheError,
} from "../caches/AvalancheCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import logger from "../logger.ts";

// ─── Collector Factory ─────────────────────────────────────────────

function makeCollector({ label, collection, fetchFn, updateFn, setErrorFn, logFn }: any) {
  return async () => {
    try {
      const data = await fetchFn();
      updateFn(data);
      await saveState(collection, data);
      if (logFn) {
        logger.info(`[${label}] ✅ ${logFn(data)}`);
      } else {
        logger.info(`[${label}] ✅ Collected`);
      }
    } catch (error: any) {
      setErrorFn(error);
      logger.error(`[${label}] ❌ ${error.message}`);
    }
  };
}

// ─── Weather Cache Collectors (via factory) ────────────────────────

const collectOpenMeteo = makeCollector({
  label: "OpenMeteo", collection: "openmeteo",
  fetchFn: fetchOpenMeteoWeather,
  updateFn: (d: any) => update("openmeteo", d),
  setErrorFn: (e: any) => setError("openmeteo", e),
  logFn: (d: any) => `${d.weatherDescription} | ${d.temperature}°C`,
});

const collectAirQuality = makeCollector({
  label: "AirQuality", collection: "air_quality",
  fetchFn: fetchAirQuality,
  updateFn: (d: any) => update("airquality", d),
  setErrorFn: (e: any) => setError("airquality", e),
  logFn: (d: any) => `US AQI: ${d.usAqi} | PM2.5: ${d.pm25}`,
});

const collectTomorrowIORealtime = makeCollector({
  label: "Tomorrow.io", collection: "tomorrowio",
  fetchFn: fetchTomorrowIORealtime,
  updateFn: (d: any) => update("tomorrowio", d),
  setErrorFn: (e: any) => setError("tomorrowio", e),
  logFn: (d: any) => `${d.weatherDescription} | Visibility: ${d.visibility}km | UV: ${d.uvIndex}`,
});

const collectTomorrowIODaily = makeCollector({
  label: "Tomorrow.io Daily", collection: "tomorrowio_daily",
  fetchFn: fetchTomorrowIODailyForecast,
  updateFn: (d: any) => update("tomorrowio_daily", d),
  setErrorFn: (e: any) => setError("tomorrowio_daily", e),
  logFn: (d: any) => `Moonrise: ${d.moonrise || "N/A"} | Moonset: ${d.moonset || "N/A"}`,
});

const collectIssPosition = makeCollector({
  label: "ISS", collection: "iss_position",
  fetchFn: fetchIssPosition,
  updateFn: updateIssPosition,
  setErrorFn: setIssPositionError,
  logFn: (d: any) => `Lat: ${d.latitude.toFixed(2)}, Lng: ${d.longitude.toFixed(2)}`,
});

const collectAstronauts = makeCollector({
  label: "Astronauts", collection: "astronauts",
  fetchFn: fetchAstronauts,
  updateFn: updateAstronauts,
  setErrorFn: setAstronautsError,
  logFn: (d: any) => `${d.total} people in space`,
});

const collectKpIndex = makeCollector({
  label: "Kp Index", collection: "kp_index",
  fetchFn: fetchKpIndex,
  updateFn: updateKpIndex,
  setErrorFn: setKpIndexError,
  logFn: (d: any) => `${d.length} readings | Current Kp: ${d[d.length - 1]?.kp ?? "?"}`,
});

const collectWildfires = makeCollector({
  label: "Wildfire", collection: "wildfires",
  fetchFn: fetchWildfires,
  updateFn: updateWildfires,
  setErrorFn: setWildfireError,
  logFn: (d: any) => {
    const largest = d.filter((e: any) => e.magnitudeValue != null)
      .sort((a: any, b: any) => b.magnitudeValue - a.magnitudeValue)[0];
    return `${d.length} active fires` +
      (largest ? ` | Largest: ${largest.title} (${largest.magnitudeValue} ${largest.magnitudeUnit})` : "");
  },
});

const collectTides = makeCollector({
  label: "Tides", collection: "tide_predictions",
  fetchFn: fetchTides,
  updateFn: updateTides,
  setErrorFn: setTideError,
  logFn: (d: any) => {
    const next = d.find((t: any) => new Date(t.time) > new Date());
    return `${d.length} predictions` +
      (next ? ` | Next: ${next.type} at ${next.time} (${next.height}m)` : "");
  },
});

const collectSolarWind = makeCollector({
  label: "Solar Wind", collection: "solar_wind",
  fetchFn: fetchSolarWind,
  updateFn: updateSolarWind,
  setErrorFn: setSolarWindError,
  logFn: (d: any) => `${d.counts.plasma}p/${d.counts.magnetic}m pts | Speed: ${d.latest.speed ?? "?"}km/s | Bz: ${d.latest.bz ?? "?"}nT`,
});

const collectGoogleAirQuality = makeCollector({
  label: "Google AQ", collection: "google_air_quality",
  fetchFn: fetchGoogleAirQuality,
  updateFn: updateGoogleAirQuality,
  setErrorFn: setGoogleAirQualityError,
  logFn: (d: any) => `AQI: ${d.usEpaAqi ?? "?"} (${d.usEpaCategory ?? "?"}) | Dominant: ${d.usEpaDominantPollutant ?? "?"}`,
});

const collectPollen = makeCollector({
  label: "Pollen", collection: "pollen",
  fetchFn: fetchPollen,
  updateFn: updatePollen,
  setErrorFn: setPollenError,
  logFn: (d: any) => {
    const today = d.daily?.[0];
    return `${d.daily?.length || 0}-day forecast | Grass: ${today?.grass?.indexInfo?.category ?? "?"} | Tree: ${today?.tree?.indexInfo?.category ?? "?"} | Weed: ${today?.weed?.indexInfo?.category ?? "?"}`;
  },
});

const collectApod = makeCollector({
  label: "APOD", collection: "apod",
  fetchFn: fetchApod,
  updateFn: updateApod,
  setErrorFn: setApodError,
  logFn: (d: any) => d.title,
});

const collectLaunches = makeCollector({
  label: "Launches", collection: "launches",
  fetchFn: fetchUpcomingLaunches,
  updateFn: updateLaunches,
  setErrorFn: setLaunchError,
  logFn: (d: any) => `${d.length} upcoming` + (d[0] ? ` | Next: ${d[0].name} (${d[0].status})` : ""),
});

const collectTwilight = makeCollector({
  label: "Twilight", collection: "twilight",
  fetchFn: fetchTwilight,
  updateFn: updateTwilight,
  setErrorFn: setTwilightError,
  logFn: (d: any) => `Civil: ${d.civilTwilightBegin} → ${d.civilTwilightEnd}`,
});

const collectEnvironmentCanada = makeCollector({
  label: "Env Canada", collection: "env_canada_warnings",
  fetchFn: fetchEnvironmentCanadaWarnings,
  updateFn: updateWarnings,
  setErrorFn: setWarningError,
  logFn: (d: any) => `${d.length} active warnings/watches`,
});

const collectAvalanche = makeCollector({
  label: "Avalanche", collection: "avalanche_forecasts",
  fetchFn: fetchAvalancheForecast,
  updateFn: updateAvalanche,
  setErrorFn: setAvalancheError,
  logFn: (d: any) => `${d.length} forecast regions`,
});

// ─── Complex Collectors (custom async flows) ──────────────────────

async function collectEarthquakes() {
  try {
    const events = await fetchEarthquakes();
    const result = await updateEarthquakes(events);
    await saveState("earthquakes_cache", events);
    const strongest = events.reduce(
      (max: any, e: any) => ((e.magnitude ?? -1) > (max.magnitude ?? -1) ? e : max),
      events[0] || {},
    );
    logger.info(
      `[Earthquake] ✅ ${events.length} events | ` +
        `${result?.upserted || 0} new, ${result?.modified || 0} updated | ` +
        `Strongest: M${strongest?.magnitude ?? "?"} ${strongest?.place ?? ""}`,
    );
  } catch (error: any) {
    setEarthquakeError(error);
    logger.error(`[Earthquake] ❌ ${error.message}`);
  }
}

async function collectNeos() {
  try {
    const neos = await fetchNeos();
    const result = await updateNeos(neos);
    await saveState("neos_cache", neos);
    const closest = neos[0];
    logger.info(
      `[NEO] ✅ ${neos.length} objects | ` +
        `${result?.upserted || 0} new | ` +
        `Closest: ${closest?.name ?? "?"} at ${Math.round(closest?.missDistanceKm ?? 0)} km`,
    );
  } catch (error: any) {
    setNeoError(error);
    logger.error(`[NEO] ❌ ${error.message}`);
  }
}

async function collectDonki() {
  try {
    const data = await fetchAllDonki();
    const result = await updateSpaceWeather(data);
    await saveState("space_weather", data);
    logger.info(
      `[DONKI] ✅ ${data.flares.length} flares (${result.flares.upserted} new) | ` +
        `${data.cmes.length} CMEs (${result.cmes.upserted} new) | ` +
        `${data.storms.length} storms (${result.storms.upserted} new)`,
    );
  } catch (error: any) {
    setSpaceWeatherError(error);
    logger.error(`[DONKI] ❌ ${error.message}`);
  }
}

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  { label: "OpenMeteo", collection: "openmeteo", ttl: OPEN_METEO_INTERVAL_MS, collectFn: collectOpenMeteo, restoreFn: (d: any) => restore("openmeteo", d), delay: 0 },
  { label: "AirQuality", collection: "air_quality", ttl: AIR_QUALITY_INTERVAL_MS, collectFn: collectAirQuality, restoreFn: (d: any) => restore("airquality", d), delay: 2_000 },
  { label: "Tomorrow.io", collection: "tomorrowio", ttl: TOMORROWIO_REALTIME_INTERVAL_MS, collectFn: collectTomorrowIORealtime, restoreFn: (d: any) => restore("tomorrowio", d), delay: 4_000 },
  { label: "Tomorrow.io Daily", collection: "tomorrowio_daily", ttl: TOMORROWIO_FORECAST_INTERVAL_MS, collectFn: collectTomorrowIODaily, restoreFn: (d: any) => restore("tomorrowio_daily", d), delay: 6_000 },
  { label: "Earthquake", collection: "earthquakes_cache", ttl: EARTHQUAKE_INTERVAL_MS, collectFn: collectEarthquakes, restoreFn: restoreEarthquakes, delay: 8_000 },
  { label: "NEO", collection: "neos_cache", ttl: NEO_INTERVAL_MS, collectFn: collectNeos, restoreFn: restoreNeos, delay: 10_000 },
  { label: "DONKI", collection: "space_weather", ttl: DONKI_INTERVAL_MS, collectFn: collectDonki, restoreFn: restoreSpaceWeather, delay: 12_000 },
  { label: "ISS Position", collection: "iss_position", ttl: ISS_POSITION_INTERVAL_MS, collectFn: collectIssPosition, restoreFn: updateIssPosition, delay: 14_000 },
  { label: "Astronauts", collection: "astronauts", ttl: ISS_ASTROS_INTERVAL_MS, collectFn: collectAstronauts, restoreFn: updateAstronauts, delay: 15_000 },
  { label: "Kp Index", collection: "kp_index", ttl: KP_INDEX_INTERVAL_MS, collectFn: collectKpIndex, restoreFn: updateKpIndex, delay: 16_000 },
  { label: "Wildfire", collection: "wildfires", ttl: WILDFIRE_INTERVAL_MS, collectFn: collectWildfires, restoreFn: updateWildfires, delay: 18_000 },
  { label: "Tides", collection: "tide_predictions", ttl: TIDE_INTERVAL_MS, collectFn: collectTides, restoreFn: updateTides, delay: 20_000 },
  { label: "Solar Wind", collection: "solar_wind", ttl: SOLAR_WIND_INTERVAL_MS, collectFn: collectSolarWind, restoreFn: updateSolarWind, delay: 22_000 },
  { label: "Google AQ", collection: "google_air_quality", ttl: GOOGLE_AIR_QUALITY_INTERVAL_MS, collectFn: collectGoogleAirQuality, restoreFn: updateGoogleAirQuality, delay: 24_000 },
  { label: "Pollen", collection: "pollen", ttl: GOOGLE_POLLEN_INTERVAL_MS, collectFn: collectPollen, restoreFn: updatePollen, delay: 26_000 },
  { label: "APOD", collection: "apod", ttl: APOD_INTERVAL_MS, collectFn: collectApod, restoreFn: updateApod, delay: 28_000 },
  { label: "Launches", collection: "launches", ttl: LAUNCH_INTERVAL_MS, collectFn: collectLaunches, restoreFn: updateLaunches, delay: 30_000 },
  { label: "Twilight", collection: "twilight", ttl: TWILIGHT_INTERVAL_MS, collectFn: collectTwilight, restoreFn: updateTwilight, delay: 32_000 },
  { label: "Env Canada", collection: "env_canada_warnings", ttl: ENV_CANADA_INTERVAL_MS, collectFn: collectEnvironmentCanada, restoreFn: updateWarnings, delay: 34_000 },
  { label: "Avalanche", collection: "avalanche_forecasts", ttl: AVALANCHE_INTERVAL_MS, collectFn: collectAvalanche, restoreFn: updateAvalanche, delay: 36_000 },
];

// ─── Start All Weather Collectors ──────────────────────────────────

export function startWeatherCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("☁️  Weather collectors started");
}

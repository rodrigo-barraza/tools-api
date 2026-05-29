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
import { disableToolRuntime } from "../services/ToolSchemaService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

interface CollectorConfig<T> {
  label: string;
  collection: string;
  fetchFn: () => Promise<T>;
  updateFn: (data: T) => void;
  setErrorFn: (error: unknown) => void;
  logFn?: (data: T) => string;
}

function makeCollector<T>(config: CollectorConfig<T>) {
  return async () => {
    try {
      const data = await config.fetchFn();
      config.updateFn(data);
      await saveState(
        config.collection,
        data as unknown as Record<string, unknown> | unknown[],
      );
      if (config.logFn) {
        logger.info(`[${config.label}] ✅ ${config.logFn(data)}`);
      } else {
        logger.info(`[${config.label}] ✅ Collected`);
      }
    } catch (error: unknown) {
      config.setErrorFn(error);
      logger.error(`[${config.label}] ❌ ${errorMessage(error)}`);
    }
  };
}

// ─── Weather Cache Collectors (via factory) ────────────────────────

const collectOpenMeteo = makeCollector({
  label: "OpenMeteo",
  collection: "openmeteo",
  fetchFn: fetchOpenMeteoWeather,
  updateFn: (d) => update("openmeteo", d as unknown as Record<string, unknown>),
  setErrorFn: (e) =>
    setError(
      "openmeteo",
      e instanceof Error ? e : { message: errorMessage(e) },
    ),
  logFn: (d) => `${d.weatherDescription} | ${d.temperature}°C`,
});

const collectAirQuality = makeCollector({
  label: "AirQuality",
  collection: "air_quality",
  fetchFn: fetchAirQuality,
  updateFn: (d) =>
    update("airquality", d as unknown as Record<string, unknown>),
  setErrorFn: (e) =>
    setError(
      "airquality",
      e instanceof Error ? e : { message: errorMessage(e) },
    ),
  logFn: (d) => `US AQI: ${d.usAqi} | PM2.5: ${d.pm25}`,
});

const collectTomorrowIORealtime = makeCollector({
  label: "Tomorrow.io",
  collection: "tomorrowio",
  fetchFn: fetchTomorrowIORealtime,
  updateFn: (d) =>
    update("tomorrowio", d as unknown as Record<string, unknown>),
  setErrorFn: (e) =>
    setError(
      "tomorrowio",
      e instanceof Error ? e : { message: errorMessage(e) },
    ),
  logFn: (d) =>
    `${d.weatherDescription} | Visibility: ${d.visibility}km | UV: ${d.uvIndex}`,
});

const collectTomorrowIODaily = makeCollector({
  label: "Tomorrow.io Daily",
  collection: "tomorrowio_daily",
  fetchFn: fetchTomorrowIODailyForecast,
  updateFn: (d) =>
    update("tomorrowio_daily", d as unknown as Record<string, unknown>),
  setErrorFn: (e) =>
    setError(
      "tomorrowio_daily",
      e instanceof Error ? e : { message: errorMessage(e) },
    ),
  logFn: (d) =>
    `Moonrise: ${d.moonrise || "N/A"} | Moonset: ${d.moonset || "N/A"}`,
});

const collectIssPosition = makeCollector({
  label: "ISS",
  collection: "iss_position",
  fetchFn: fetchIssPosition,
  updateFn: (d) =>
    updateIssPosition(d as unknown as Parameters<typeof updateIssPosition>[0]),
  setErrorFn: (e) =>
    setIssPositionError(e instanceof Error ? e : { message: errorMessage(e) }),
  logFn: (d) => `Lat: ${d.latitude.toFixed(2)}, Lng: ${d.longitude.toFixed(2)}`,
});

const collectAstronauts = makeCollector({
  label: "Astronauts",
  collection: "astronauts",
  fetchFn: fetchAstronauts,
  updateFn: (d) =>
    updateAstronauts(d as unknown as Parameters<typeof updateAstronauts>[0]),
  setErrorFn: (e) =>
    setAstronautsError(e instanceof Error ? e : { message: errorMessage(e) }),
  logFn: (d) => `${d.total} people in space`,
});

const collectKpIndex = makeCollector({
  label: "Kp Index",
  collection: "kp_index",
  fetchFn: fetchKpIndex,
  updateFn: updateKpIndex,
  setErrorFn: (e) =>
    setKpIndexError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) =>
    `${d.length} readings | Current Kp: ${d[d.length - 1]?.kp ?? "?"}`,
});

const collectWildfires = makeCollector({
  label: "Wildfire",
  collection: "wildfires",
  fetchFn: fetchWildfires,
  updateFn: updateWildfires,
  setErrorFn: (e) =>
    setWildfireError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) => {
    const largest = d
      .filter((e) => e.magnitudeValue != null)
      .sort(
        (firstItem, b) =>
          (b.magnitudeValue ?? 0) - (firstItem.magnitudeValue ?? 0),
      )[0];
    return (
      `${d.length} active fires` +
      (largest
        ? ` | Largest: ${(largest as unknown as Record<string, unknown>).title} (${largest.magnitudeValue} ${(largest as unknown as Record<string, unknown>).magnitudeUnit})`
        : "")
    );
  },
});

const collectTides = makeCollector({
  label: "Tides",
  collection: "tide_predictions",
  fetchFn: fetchTides,
  updateFn: updateTides,
  setErrorFn: (e) =>
    setTideError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) => {
    const next = d.find((time) => new Date(time.time) > new Date());
    return (
      `${d.length} predictions` +
      (next
        ? ` | Next: ${(next as unknown as Record<string, unknown>).type} at ${next.time} (${(next as unknown as Record<string, unknown>).height}m)`
        : "")
    );
  },
});

const collectSolarWind = makeCollector({
  label: "Solar Wind",
  collection: "solar_wind",
  fetchFn: fetchSolarWind,
  updateFn: updateSolarWind,
  setErrorFn: (e) =>
    setSolarWindError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) =>
    `${d.counts.plasma}p/${d.counts.magnetic}m pts | Speed: ${d.latest.speed ?? "?"}km/s | Bz: ${d.latest.bz ?? "?"}nT`,
});

const collectGoogleAirQuality = makeCollector({
  label: "Google AQ",
  collection: "google_air_quality",
  fetchFn: fetchGoogleAirQuality,
  updateFn: updateGoogleAirQuality,
  setErrorFn: (e) => {
    setGoogleAirQualityError(
      e instanceof Error ? e : new Error(errorMessage(e)),
    );
    const message = errorMessage(e);
    if (
      message.includes("API_KEY_SERVICE_BLOCKED") ||
      message.includes("PERMISSION_DENIED")
    ) {
      disableToolRuntime(
        "get_detailed_air_quality",
        "Google Air Quality API blocked (API_KEY_SERVICE_BLOCKED)",
      );
    }
  },
  logFn: (d) =>
    `AQI: ${d.usEpaAqi ?? "?"} (${d.usEpaCategory ?? "?"}) | Dominant: ${d.usEpaDominantPollutant ?? "?"}`,
});

const collectPollen = makeCollector({
  label: "Pollen",
  collection: "pollen",
  fetchFn: fetchPollen,
  updateFn: updatePollen,
  setErrorFn: (e) => {
    setPollenError(e instanceof Error ? e : new Error(errorMessage(e)));
    const message = errorMessage(e);
    if (
      message.includes("API_KEY_SERVICE_BLOCKED") ||
      message.includes("PERMISSION_DENIED")
    ) {
      disableToolRuntime(
        "get_pollen_forecast",
        "Google Pollen API blocked (API_KEY_SERVICE_BLOCKED)",
      );
    }
  },
  logFn: (d) => {
    const today = d.daily?.[0];
    return `${d.daily?.length || 0}-day forecast | Grass: ${today?.grass?.indexInfo?.category ?? "?"} | Tree: ${today?.tree?.indexInfo?.category ?? "?"} | Weed: ${today?.weed?.indexInfo?.category ?? "?"}`;
  },
});

const collectApod = makeCollector({
  label: "APOD",
  collection: "apod",
  fetchFn: fetchApod,
  updateFn: updateApod,
  setErrorFn: (e) =>
    setApodError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) => d.title,
});

const collectLaunches = makeCollector({
  label: "Launches",
  collection: "launches",
  fetchFn: fetchUpcomingLaunches,
  updateFn: updateLaunches,
  setErrorFn: (e) =>
    setLaunchError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) =>
    `${d.length} upcoming` +
    (d[0] ? ` | Next: ${d[0].name} (${d[0].status})` : ""),
});

const collectTwilight = makeCollector({
  label: "Twilight",
  collection: "twilight",
  fetchFn: fetchTwilight,
  updateFn: updateTwilight,
  setErrorFn: (e) =>
    setTwilightError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) => `Civil: ${d.civilTwilightBegin} → ${d.civilTwilightEnd}`,
});

const collectEnvironmentCanada = makeCollector({
  label: "Env Canada",
  collection: "env_canada_warnings",
  fetchFn: fetchEnvironmentCanadaWarnings,
  updateFn: updateWarnings,
  setErrorFn: (e) =>
    setWarningError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) => `${d.length} active warnings/watches`,
});

const collectAvalanche = makeCollector({
  label: "Avalanche",
  collection: "avalanche_forecasts",
  fetchFn: fetchAvalancheForecast,
  updateFn: updateAvalanche,
  setErrorFn: (e) =>
    setAvalancheError(e instanceof Error ? e : new Error(errorMessage(e))),
  logFn: (d) => `${d.length} forecast regions`,
});

// ─── Complex Collectors (custom async flows) ──────────────────────

async function collectEarthquakes() {
  try {
    const events = await fetchEarthquakes();
    const result = await updateEarthquakes(events);
    await saveState("earthquakes_cache", events);
    const strongest = events.reduce(
      (max: (typeof events)[0], e: (typeof events)[0]) =>
        (e.magnitude ?? -1) > (max.magnitude ?? -1) ? e : max,
      events[0] || ({} as (typeof events)[0]),
    );
    logger.info(
      `[Earthquake] ✅ ${events.length} events | ` +
        `${result?.upserted || 0} new, ${result?.modified || 0} updated | ` +
        `Strongest: M${strongest?.magnitude ?? "?"} ${strongest?.place ?? ""}`,
    );
  } catch (error: unknown) {
    setEarthquakeError({ message: errorMessage(error) });
    logger.error(`[Earthquake] ❌ ${errorMessage(error)}`);
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
  } catch (error: unknown) {
    setNeoError({ message: errorMessage(error) });
    logger.error(`[NEO] ❌ ${errorMessage(error)}`);
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
  } catch (error: unknown) {
    setSpaceWeatherError({ message: errorMessage(error) });
    logger.error(`[DONKI] ❌ ${errorMessage(error)}`);
  }
}

// ─── Startup Definitions ──────────────────────────────────────────

const STARTUP_TASKS = [
  {
    label: "OpenMeteo",
    collection: "openmeteo",
    ttl: OPEN_METEO_INTERVAL_MS,
    collectFn: collectOpenMeteo,
    restoreFn: (d: Record<string, unknown>) => restore("openmeteo", d),
    delay: 0,
  },
  {
    label: "AirQuality",
    collection: "air_quality",
    ttl: AIR_QUALITY_INTERVAL_MS,
    collectFn: collectAirQuality,
    restoreFn: (d: Record<string, unknown>) => restore("airquality", d),
    delay: 2_000,
  },
  {
    label: "Tomorrow.io",
    collection: "tomorrowio",
    ttl: TOMORROWIO_REALTIME_INTERVAL_MS,
    collectFn: collectTomorrowIORealtime,
    restoreFn: (d: Record<string, unknown>) => restore("tomorrowio", d),
    delay: 4_000,
  },
  {
    label: "Tomorrow.io Daily",
    collection: "tomorrowio_daily",
    ttl: TOMORROWIO_FORECAST_INTERVAL_MS,
    collectFn: collectTomorrowIODaily,
    restoreFn: (d: Record<string, unknown>) => restore("tomorrowio_daily", d),
    delay: 6_000,
  },
  {
    label: "Earthquake",
    collection: "earthquakes_cache",
    ttl: EARTHQUAKE_INTERVAL_MS,
    collectFn: collectEarthquakes,
    restoreFn: restoreEarthquakes,
    delay: 8_000,
  },
  {
    label: "NEO",
    collection: "neos_cache",
    ttl: NEO_INTERVAL_MS,
    collectFn: collectNeos,
    restoreFn: restoreNeos,
    delay: 10_000,
  },
  {
    label: "DONKI",
    collection: "space_weather",
    ttl: DONKI_INTERVAL_MS,
    collectFn: collectDonki,
    restoreFn: restoreSpaceWeather,
    delay: 12_000,
  },
  {
    label: "ISS Position",
    collection: "iss_position",
    ttl: ISS_POSITION_INTERVAL_MS,
    collectFn: collectIssPosition,
    restoreFn: updateIssPosition,
    delay: 14_000,
  },
  {
    label: "Astronauts",
    collection: "astronauts",
    ttl: ISS_ASTROS_INTERVAL_MS,
    collectFn: collectAstronauts,
    restoreFn: updateAstronauts,
    delay: 15_000,
  },
  {
    label: "Kp Index",
    collection: "kp_index",
    ttl: KP_INDEX_INTERVAL_MS,
    collectFn: collectKpIndex,
    restoreFn: updateKpIndex,
    delay: 16_000,
  },
  {
    label: "Wildfire",
    collection: "wildfires",
    ttl: WILDFIRE_INTERVAL_MS,
    collectFn: collectWildfires,
    restoreFn: updateWildfires,
    delay: 18_000,
  },
  {
    label: "Tides",
    collection: "tide_predictions",
    ttl: TIDE_INTERVAL_MS,
    collectFn: collectTides,
    restoreFn: updateTides,
    delay: 20_000,
  },
  {
    label: "Solar Wind",
    collection: "solar_wind",
    ttl: SOLAR_WIND_INTERVAL_MS,
    collectFn: collectSolarWind,
    restoreFn: updateSolarWind,
    delay: 22_000,
  },
  {
    label: "Google AQ",
    collection: "google_air_quality",
    ttl: GOOGLE_AIR_QUALITY_INTERVAL_MS,
    collectFn: collectGoogleAirQuality,
    restoreFn: updateGoogleAirQuality,
    delay: 24_000,
  },
  {
    label: "Pollen",
    collection: "pollen",
    ttl: GOOGLE_POLLEN_INTERVAL_MS,
    collectFn: collectPollen,
    restoreFn: updatePollen,
    delay: 26_000,
  },
  {
    label: "APOD",
    collection: "apod",
    ttl: APOD_INTERVAL_MS,
    collectFn: collectApod,
    restoreFn: updateApod,
    delay: 28_000,
  },
  {
    label: "Launches",
    collection: "launches",
    ttl: LAUNCH_INTERVAL_MS,
    collectFn: collectLaunches,
    restoreFn: updateLaunches,
    delay: 30_000,
  },
  {
    label: "Twilight",
    collection: "twilight",
    ttl: TWILIGHT_INTERVAL_MS,
    collectFn: collectTwilight,
    restoreFn: updateTwilight,
    delay: 32_000,
  },
  {
    label: "Env Canada",
    collection: "env_canada_warnings",
    ttl: ENV_CANADA_INTERVAL_MS,
    collectFn: collectEnvironmentCanada,
    restoreFn: updateWarnings,
    delay: 34_000,
  },
  {
    label: "Avalanche",
    collection: "avalanche_forecasts",
    ttl: AVALANCHE_INTERVAL_MS,
    collectFn: collectAvalanche,
    restoreFn: updateAvalanche,
    delay: 36_000,
  },
];

// ─── Start All Weather Collectors ──────────────────────────────────

export function startWeatherCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("☁️  Weather collectors started");
}

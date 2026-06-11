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
  MOON_PHASE_INTERVAL_MS,
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
import {
  updateMoonPhase,
  setMoonPhaseError,
} from "../caches/MoonPhaseCache.ts";
import { calculateMoonPhase } from "../utilities/MoonPhaseCalculator.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import { disableToolRuntime } from "../services/ToolSchemaService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

interface CollectorConfig<T> {
  label: string;
  collection: string;
  fetchFunction: () => Promise<T>;
  updateFn: (data: T) => void;
  setErrorFn: (error: unknown) => void;
  logFn?: (data: T) => string;
}

function makeCollector<T>(config: CollectorConfig<T>) {
  return async () => {
    try {
      const data = await config.fetchFunction();
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
  fetchFunction: fetchOpenMeteoWeather,
  updateFn: (weatherData) => update("openmeteo", weatherData as unknown as Record<string, unknown>),
  setErrorFn: (error) =>
    setError(
      "openmeteo",
      error instanceof Error ? error : { message: errorMessage(error) },
    ),
  logFn: (weatherData) => `${weatherData.weatherDescription} | ${weatherData.temperature}°C`,
});

const collectAirQuality = makeCollector({
  label: "AirQuality",
  collection: "air_quality",
  fetchFunction: fetchAirQuality,
  updateFn: (weatherData) =>
    update("airquality", weatherData as unknown as Record<string, unknown>),
  setErrorFn: (error) =>
    setError(
      "airquality",
      error instanceof Error ? error : { message: errorMessage(error) },
    ),
  logFn: (weatherData) => `US AQI: ${weatherData.usAqi} | PM2.5: ${weatherData.pm25}`,
});

const collectTomorrowIORealtime = makeCollector({
  label: "Tomorrow.io",
  collection: "tomorrowio",
  fetchFunction: fetchTomorrowIORealtime,
  updateFn: (weatherData) =>
    update("tomorrowio", weatherData as unknown as Record<string, unknown>),
  setErrorFn: (error) =>
    setError(
      "tomorrowio",
      error instanceof Error ? error : { message: errorMessage(error) },
    ),
  logFn: (weatherData) =>
    `${weatherData.weatherDescription} | Visibility: ${weatherData.visibility}km | UV: ${weatherData.uvIndex}`,
});

const collectTomorrowIODaily = makeCollector({
  label: "Tomorrow.io Daily",
  collection: "tomorrowio_daily",
  fetchFunction: fetchTomorrowIODailyForecast,
  updateFn: (weatherData) =>
    update("tomorrowio_daily", weatherData as unknown as Record<string, unknown>),
  setErrorFn: (error) =>
    setError(
      "tomorrowio_daily",
      error instanceof Error ? error : { message: errorMessage(error) },
    ),
  logFn: (weatherData) =>
    `Moonrise: ${weatherData.moonrise || "N/A"} | Moonset: ${weatherData.moonset || "N/A"}`,
});

const collectIssPosition = makeCollector({
  label: "ISS",
  collection: "iss_position",
  fetchFunction: fetchIssPosition,
  updateFn: (issData) =>
    updateIssPosition(issData as unknown as Parameters<typeof updateIssPosition>[0]),
  setErrorFn: (error) =>
    setIssPositionError(error instanceof Error ? error : { message: errorMessage(error) }),
  logFn: (issData) => `Lat: ${issData.latitude.toFixed(2)}, Lng: ${issData.longitude.toFixed(2)}`,
});

const collectAstronauts = makeCollector({
  label: "Astronauts",
  collection: "astronauts",
  fetchFunction: fetchAstronauts,
  updateFn: (astrosData) =>
    updateAstronauts(astrosData as unknown as Parameters<typeof updateAstronauts>[0]),
  setErrorFn: (error) =>
    setAstronautsError(error instanceof Error ? error : { message: errorMessage(error) }),
  logFn: (astrosData) => `${astrosData.total} people in space`,
});

const collectKpIndex = makeCollector({
  label: "Kp Index",
  collection: "kp_index",
  fetchFunction: fetchKpIndex,
  updateFn: updateKpIndex,
  setErrorFn: (error) =>
    setKpIndexError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (kpData) =>
    `${kpData.length} readings | Current Kp: ${kpData[kpData.length - 1]?.kp ?? "?"}`,
});

const collectWildfires = makeCollector({
  label: "Wildfire",
  collection: "wildfires",
  fetchFunction: fetchWildfires,
  updateFn: updateWildfires,
  setErrorFn: (error) =>
    setWildfireError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (wildfireData) => {
    const largest = wildfireData
      .filter((e) => e.magnitudeValue != null)
      .sort(
        (firstItem, b) =>
          (b.magnitudeValue ?? 0) - (firstItem.magnitudeValue ?? 0),
      )[0];
    return (
      `${wildfireData.length} active fires` +
      (largest
        ? ` | Largest: ${(largest as unknown as Record<string, unknown>).title} (${largest.magnitudeValue} ${(largest as unknown as Record<string, unknown>).magnitudeUnit})`
        : "")
    );
  },
});

const collectTides = makeCollector({
  label: "Tides",
  collection: "tide_predictions",
  fetchFunction: fetchTides,
  updateFn: updateTides,
  setErrorFn: (error) =>
    setTideError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (tideData) => {
    const next = tideData.find((time) => new Date(time.time) > new Date());
    return (
      `${tideData.length} predictions` +
      (next
        ? ` | Next: ${(next as unknown as Record<string, unknown>).type} at ${next.time} (${(next as unknown as Record<string, unknown>).height}m)`
        : "")
    );
  },
});

const collectSolarWind = makeCollector({
  label: "Solar Wind",
  collection: "solar_wind",
  fetchFunction: fetchSolarWind,
  updateFn: updateSolarWind,
  setErrorFn: (error) =>
    setSolarWindError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (solarWindData) =>
    `${solarWindData.counts.plasma}p/${solarWindData.counts.magnetic}m pts | Speed: ${solarWindData.latest.speed ?? "?"}km/s | Bz: ${solarWindData.latest.bz ?? "?"}nT`,
});

const collectGoogleAirQuality = makeCollector({
  label: "Google AQ",
  collection: "google_air_quality",
  fetchFunction: fetchGoogleAirQuality,
  updateFn: updateGoogleAirQuality,
  setErrorFn: (error) => {
    setGoogleAirQualityError(
      error instanceof Error ? error : new Error(errorMessage(error)),
    );
    const message = errorMessage(error);
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
  logFn: (googleAqiData) =>
    `AQI: ${googleAqiData.usEpaAqi ?? "?"} (${googleAqiData.usEpaCategory ?? "?"}) | Dominant: ${googleAqiData.usEpaDominantPollutant ?? "?"}`,
});

const collectPollen = makeCollector({
  label: "Pollen",
  collection: "pollen",
  fetchFunction: fetchPollen,
  updateFn: updatePollen,
  setErrorFn: (error) => {
    setPollenError(error instanceof Error ? error : new Error(errorMessage(error)));
    const message = errorMessage(error);
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
  logFn: (pollenData) => {
    const today = pollenData.daily?.[0];
    return `${pollenData.daily?.length || 0}-day forecast | Grass: ${today?.grass?.indexInfo?.category ?? "?"} | Tree: ${today?.tree?.indexInfo?.category ?? "?"} | Weed: ${today?.weed?.indexInfo?.category ?? "?"}`;
  },
});

const collectApod = makeCollector({
  label: "APOD",
  collection: "apod",
  fetchFunction: fetchApod,
  updateFn: updateApod,
  setErrorFn: (error) =>
    setApodError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (apodData) => apodData.title,
});

const collectLaunches = makeCollector({
  label: "Launches",
  collection: "launches",
  fetchFunction: fetchUpcomingLaunches,
  updateFn: updateLaunches,
  setErrorFn: (error) =>
    setLaunchError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (launchData) =>
    `${launchData.length} upcoming` +
    (launchData[0] ? ` | Next: ${launchData[0].name} (${launchData[0].status})` : ""),
});

const collectTwilight = makeCollector({
  label: "Twilight",
  collection: "twilight",
  fetchFunction: fetchTwilight,
  updateFn: updateTwilight,
  setErrorFn: (error) =>
    setTwilightError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (twilightData) => `Civil: ${twilightData.civilTwilightBegin} → ${twilightData.civilTwilightEnd}`,
});

const collectEnvironmentCanada = makeCollector({
  label: "Env Canada",
  collection: "env_canada_warnings",
  fetchFunction: fetchEnvironmentCanadaWarnings,
  updateFn: updateWarnings,
  setErrorFn: (error) =>
    setWarningError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (warningData) => `${warningData.length} active warnings/watches`,
});

const collectAvalanche = makeCollector({
  label: "Avalanche",
  collection: "avalanche_forecasts",
  fetchFunction: fetchAvalancheForecast,
  updateFn: updateAvalanche,
  setErrorFn: (error) =>
    setAvalancheError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (avalancheData) => `${avalancheData.length} forecast regions`,
});

const collectMoonPhase = makeCollector({
  label: "Moon Phase",
  collection: "moon_phase",
  fetchFunction: async () => calculateMoonPhase(),
  updateFn: updateMoonPhase,
  setErrorFn: (error) =>
    setMoonPhaseError(error instanceof Error ? error : new Error(errorMessage(error))),
  logFn: (moonPhaseData) =>
    `${moonPhaseData.phaseEmoji} ${moonPhaseData.phaseName} | ${moonPhaseData.illuminationPercent}% illuminated`,
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
    collectFunction: collectOpenMeteo,
    restoreFunction: (record: Record<string, unknown>) => restore("openmeteo", record),
    delay: 0,
  },
  {
    label: "AirQuality",
    collection: "air_quality",
    ttl: AIR_QUALITY_INTERVAL_MS,
    collectFunction: collectAirQuality,
    restoreFunction: (record: Record<string, unknown>) => restore("airquality", record),
    delay: 2_000,
  },
  {
    label: "Tomorrow.io",
    collection: "tomorrowio",
    ttl: TOMORROWIO_REALTIME_INTERVAL_MS,
    collectFunction: collectTomorrowIORealtime,
    restoreFunction: (record: Record<string, unknown>) => restore("tomorrowio", record),
    delay: 4_000,
  },
  {
    label: "Tomorrow.io Daily",
    collection: "tomorrowio_daily",
    ttl: TOMORROWIO_FORECAST_INTERVAL_MS,
    collectFunction: collectTomorrowIODaily,
    restoreFunction: (record: Record<string, unknown>) => restore("tomorrowio_daily", record),
    delay: 6_000,
  },
  {
    label: "Earthquake",
    collection: "earthquakes_cache",
    ttl: EARTHQUAKE_INTERVAL_MS,
    collectFunction: collectEarthquakes,
    restoreFunction: restoreEarthquakes,
    delay: 8_000,
  },
  {
    label: "NEO",
    collection: "neos_cache",
    ttl: NEO_INTERVAL_MS,
    collectFunction: collectNeos,
    restoreFunction: restoreNeos,
    delay: 10_000,
  },
  {
    label: "DONKI",
    collection: "space_weather",
    ttl: DONKI_INTERVAL_MS,
    collectFunction: collectDonki,
    restoreFunction: restoreSpaceWeather,
    delay: 12_000,
  },
  {
    label: "ISS Position",
    collection: "iss_position",
    ttl: ISS_POSITION_INTERVAL_MS,
    collectFunction: collectIssPosition,
    restoreFunction: updateIssPosition,
    delay: 14_000,
  },
  {
    label: "Astronauts",
    collection: "astronauts",
    ttl: ISS_ASTROS_INTERVAL_MS,
    collectFunction: collectAstronauts,
    restoreFunction: updateAstronauts,
    delay: 15_000,
  },
  {
    label: "Kp Index",
    collection: "kp_index",
    ttl: KP_INDEX_INTERVAL_MS,
    collectFunction: collectKpIndex,
    restoreFunction: updateKpIndex,
    delay: 16_000,
  },
  {
    label: "Wildfire",
    collection: "wildfires",
    ttl: WILDFIRE_INTERVAL_MS,
    collectFunction: collectWildfires,
    restoreFunction: updateWildfires,
    delay: 18_000,
  },
  {
    label: "Tides",
    collection: "tide_predictions",
    ttl: TIDE_INTERVAL_MS,
    collectFunction: collectTides,
    restoreFunction: updateTides,
    delay: 20_000,
  },
  {
    label: "Solar Wind",
    collection: "solar_wind",
    ttl: SOLAR_WIND_INTERVAL_MS,
    collectFunction: collectSolarWind,
    restoreFunction: updateSolarWind,
    delay: 22_000,
  },
  {
    label: "Google AQ",
    collection: "google_air_quality",
    ttl: GOOGLE_AIR_QUALITY_INTERVAL_MS,
    collectFunction: collectGoogleAirQuality,
    restoreFunction: updateGoogleAirQuality,
    delay: 24_000,
  },
  {
    label: "Pollen",
    collection: "pollen",
    ttl: GOOGLE_POLLEN_INTERVAL_MS,
    collectFunction: collectPollen,
    restoreFunction: updatePollen,
    delay: 26_000,
  },
  {
    label: "APOD",
    collection: "apod",
    ttl: APOD_INTERVAL_MS,
    collectFunction: collectApod,
    restoreFunction: updateApod,
    delay: 28_000,
  },
  {
    label: "Launches",
    collection: "launches",
    ttl: LAUNCH_INTERVAL_MS,
    collectFunction: collectLaunches,
    restoreFunction: updateLaunches,
    delay: 30_000,
  },
  {
    label: "Twilight",
    collection: "twilight",
    ttl: TWILIGHT_INTERVAL_MS,
    collectFunction: collectTwilight,
    restoreFunction: updateTwilight,
    delay: 32_000,
  },
  {
    label: "Env Canada",
    collection: "env_canada_warnings",
    ttl: ENV_CANADA_INTERVAL_MS,
    collectFunction: collectEnvironmentCanada,
    restoreFunction: updateWarnings,
    delay: 34_000,
  },
  {
    label: "Avalanche",
    collection: "avalanche_forecasts",
    ttl: AVALANCHE_INTERVAL_MS,
    collectFunction: collectAvalanche,
    restoreFunction: updateAvalanche,
    delay: 36_000,
  },
  {
    label: "Moon Phase",
    collection: "moon_phase",
    ttl: MOON_PHASE_INTERVAL_MS,
    collectFunction: collectMoonPhase,
    restoreFunction: updateMoonPhase,
    delay: 38_000,
  },
];

// ─── Start All Weather Collectors ──────────────────────────────────

export function startWeatherCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("☁️  Weather collectors started");
}

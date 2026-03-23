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
} from "../constants.js";
import { fetchOpenMeteoWeather } from "../fetchers/weather/OpenMeteoFetcher.js";
import { fetchAirQuality } from "../fetchers/weather/AirQualityFetcher.js";
import {
  fetchTomorrowIORealtime,
  fetchTomorrowIODailyForecast,
} from "../fetchers/weather/TomorrowIOFetcher.js";
import { fetchEarthquakes } from "../fetchers/weather/EarthquakeFetcher.js";
import { fetchNeos } from "../fetchers/weather/NeoFetcher.js";
import { fetchAllDonki } from "../fetchers/weather/DonkiFetcher.js";
import {
  fetchIssPosition,
  fetchAstronauts,
} from "../fetchers/weather/IssFetcher.js";
import { fetchKpIndex } from "../fetchers/weather/KpIndexFetcher.js";
import { fetchWildfires } from "../fetchers/weather/WildfireFetcher.js";
import { fetchTides } from "../fetchers/weather/TideFetcher.js";
import { fetchSolarWind } from "../fetchers/weather/SolarWindFetcher.js";
import { fetchGoogleAirQuality } from "../fetchers/weather/GoogleAirQualityFetcher.js";
import { fetchApod } from "../fetchers/weather/ApodFetcher.js";
import { fetchUpcomingLaunches } from "../fetchers/weather/LaunchFetcher.js";
import { fetchTwilight } from "../fetchers/weather/TwilightFetcher.js";
import { fetchEnvironmentCanadaWarnings } from "../fetchers/weather/EnvironmentCanadaFetcher.js";
import { fetchAvalancheForecast } from "../fetchers/weather/AvalancheFetcher.js";
import { fetchPollen } from "../fetchers/weather/GooglePollenFetcher.js";
import { update, setError } from "../caches/WeatherCache.js";
import {
  updateEarthquakes,
  setEarthquakeError,
} from "../caches/EarthquakeCache.js";
import { updateNeos, setNeoError } from "../caches/NeoCache.js";
import {
  updateSpaceWeather,
  setSpaceWeatherError,
} from "../caches/SpaceWeatherCache.js";
import {
  updateIssPosition,
  setIssPositionError,
  updateAstronauts,
  setAstronautsError,
} from "../caches/IssCache.js";
import { updateKpIndex, setKpIndexError } from "../caches/KpIndexCache.js";
import { updateWildfires, setWildfireError } from "../caches/WildfireCache.js";
import { updateTides, setTideError } from "../caches/TideCache.js";
import {
  updateSolarWind,
  setSolarWindError,
} from "../caches/SolarWindCache.js";
import {
  updateGoogleAirQuality,
  setGoogleAirQualityError,
} from "../caches/GoogleAirQualityCache.js";
import { updatePollen, setPollenError } from "../caches/PollenCache.js";
import { updateApod, setApodError } from "../caches/ApodCache.js";
import { updateLaunches, setLaunchError } from "../caches/LaunchCache.js";
import { updateTwilight, setTwilightError } from "../caches/TwilightCache.js";
import {
  updateWarnings,
  setWarningError,
} from "../caches/EnvironmentCanadaCache.js";
import {
  updateAvalanche,
  setAvalancheError,
} from "../caches/AvalancheCache.js";

// ─── Individual Collectors ─────────────────────────────────────────

async function collectOpenMeteo() {
  try {
    const data = await fetchOpenMeteoWeather();
    update("openmeteo", data);
    console.log(
      `[OpenMeteo] ✅ ${data.weatherDescription} | ${data.temperature}°C`,
    );
  } catch (error) {
    setError("openmeteo", error);
    console.error(`[OpenMeteo] ❌ ${error.message}`);
  }
}

async function collectAirQuality() {
  try {
    const data = await fetchAirQuality();
    update("airquality", data);
    console.log(`[AirQuality] ✅ US AQI: ${data.usAqi} | PM2.5: ${data.pm25}`);
  } catch (error) {
    setError("airquality", error);
    console.error(`[AirQuality] ❌ ${error.message}`);
  }
}

async function collectTomorrowIORealtime() {
  try {
    const data = await fetchTomorrowIORealtime();
    update("tomorrowio", data);
    console.log(
      `[Tomorrow.io] ✅ ${data.weatherDescription} | Visibility: ${data.visibility}km | UV: ${data.uvIndex}`,
    );
  } catch (error) {
    setError("tomorrowio", error);
    console.error(`[Tomorrow.io] ❌ ${error.message}`);
  }
}

async function collectTomorrowIODaily() {
  try {
    const data = await fetchTomorrowIODailyForecast();
    update("tomorrowio_daily", data);
    console.log(
      `[Tomorrow.io Daily] ✅ Moonrise: ${data.moonrise || "N/A"} | Moonset: ${data.moonset || "N/A"}`,
    );
  } catch (error) {
    setError("tomorrowio_daily", error);
    console.error(`[Tomorrow.io Daily] ❌ ${error.message}`);
  }
}

async function collectEarthquakes() {
  try {
    const events = await fetchEarthquakes();
    const result = await updateEarthquakes(events);
    const strongest = events.reduce(
      (max, e) => ((e.magnitude ?? -1) > (max.magnitude ?? -1) ? e : max),
      events[0] || {},
    );
    console.log(
      `[Earthquake] ✅ ${events.length} events | ` +
        `${result?.upserted || 0} new, ${result?.modified || 0} updated | ` +
        `Strongest: M${strongest?.magnitude ?? "?"} ${strongest?.place ?? ""}`,
    );
  } catch (error) {
    setEarthquakeError(error);
    console.error(`[Earthquake] ❌ ${error.message}`);
  }
}

async function collectNeos() {
  try {
    const neos = await fetchNeos();
    const result = await updateNeos(neos);
    const closest = neos[0];
    console.log(
      `[NEO] ✅ ${neos.length} objects | ` +
        `${result?.upserted || 0} new | ` +
        `Closest: ${closest?.name ?? "?"} at ${Math.round(closest?.missDistanceKm ?? 0)} km`,
    );
  } catch (error) {
    setNeoError(error);
    console.error(`[NEO] ❌ ${error.message}`);
  }
}

async function collectDonki() {
  try {
    const data = await fetchAllDonki();
    const result = await updateSpaceWeather(data);
    console.log(
      `[DONKI] ✅ ${data.flares.length} flares (${result.flares.upserted} new) | ` +
        `${data.cmes.length} CMEs (${result.cmes.upserted} new) | ` +
        `${data.storms.length} storms (${result.storms.upserted} new)`,
    );
  } catch (error) {
    setSpaceWeatherError(error);
    console.error(`[DONKI] ❌ ${error.message}`);
  }
}

async function collectIssPosition() {
  try {
    const position = await fetchIssPosition();
    updateIssPosition(position);
    console.log(
      `[ISS] ✅ Lat: ${position.latitude.toFixed(2)}, Lng: ${position.longitude.toFixed(2)}`,
    );
  } catch (error) {
    setIssPositionError(error);
    console.error(`[ISS Position] ❌ ${error.message}`);
  }
}

async function collectAstronauts() {
  try {
    const data = await fetchAstronauts();
    updateAstronauts(data);
    console.log(`[Astronauts] ✅ ${data.total} people in space`);
  } catch (error) {
    setAstronautsError(error);
    console.error(`[Astronauts] ❌ ${error.message}`);
  }
}

async function collectKpIndex() {
  try {
    const readings = await fetchKpIndex();
    updateKpIndex(readings);
    const latest = readings[readings.length - 1];
    console.log(
      `[Kp Index] ✅ ${readings.length} readings | Current Kp: ${latest?.kp ?? "?"}`,
    );
  } catch (error) {
    setKpIndexError(error);
    console.error(`[Kp Index] ❌ ${error.message}`);
  }
}

async function collectWildfires() {
  try {
    const events = await fetchWildfires();
    updateWildfires(events);
    const largest = events
      .filter((e) => e.magnitudeValue != null)
      .sort((a, b) => b.magnitudeValue - a.magnitudeValue)[0];
    console.log(
      `[Wildfire] ✅ ${events.length} active fires` +
        (largest
          ? ` | Largest: ${largest.title} (${largest.magnitudeValue} ${largest.magnitudeUnit})`
          : ""),
    );
  } catch (error) {
    setWildfireError(error);
    console.error(`[Wildfire] ❌ ${error.message}`);
  }
}

async function collectTides() {
  try {
    const predictions = await fetchTides();
    updateTides(predictions);
    const next = predictions.find((t) => new Date(t.time) > new Date());
    console.log(
      `[Tides] ✅ ${predictions.length} predictions` +
        (next ? ` | Next: ${next.type} at ${next.time} (${next.height}m)` : ""),
    );
  } catch (error) {
    setTideError(error);
    console.error(`[Tides] ❌ ${error.message}`);
  }
}

async function collectSolarWind() {
  try {
    const data = await fetchSolarWind();
    updateSolarWind(data);
    const l = data.latest;
    console.log(
      `[Solar Wind] ✅ ${data.counts.plasma}p/${data.counts.magnetic}m pts | ` +
        `Speed: ${l.speed ?? "?"}km/s | Bz: ${l.bz ?? "?"}nT`,
    );
  } catch (error) {
    setSolarWindError(error);
    console.error(`[Solar Wind] ❌ ${error.message}`);
  }
}

async function collectGoogleAirQuality() {
  try {
    const data = await fetchGoogleAirQuality();
    updateGoogleAirQuality(data);
    console.log(
      `[Google AQ] ✅ AQI: ${data.usEpaAqi ?? "?"} (${data.usEpaCategory ?? "?"}) | ` +
        `Dominant: ${data.usEpaDominantPollutant ?? "?"}`,
    );
  } catch (error) {
    setGoogleAirQualityError(error);
    console.error(`[Google AQ] ❌ ${error.message}`);
  }
}

async function collectPollen() {
  try {
    const data = await fetchPollen();
    updatePollen(data);
    const today = data.daily?.[0];
    const grass = today?.grass?.indexInfo?.category ?? "?";
    const tree = today?.tree?.indexInfo?.category ?? "?";
    const weed = today?.weed?.indexInfo?.category ?? "?";
    console.log(
      `[Pollen] ✅ ${data.daily?.length || 0}-day forecast | ` +
        `Grass: ${grass} | Tree: ${tree} | Weed: ${weed}`,
    );
  } catch (error) {
    setPollenError(error);
    console.error(`[Pollen] ❌ ${error.message}`);
  }
}

async function collectApod() {
  try {
    const data = await fetchApod();
    updateApod(data);
    console.log(`[APOD] ✅ ${data.title}`);
  } catch (error) {
    setApodError(error);
    console.error(`[APOD] ❌ ${error.message}`);
  }
}

async function collectLaunches() {
  try {
    const launches = await fetchUpcomingLaunches();
    updateLaunches(launches);
    const next = launches[0];
    console.log(
      `[Launches] ✅ ${launches.length} upcoming` +
        (next ? ` | Next: ${next.name} (${next.status})` : ""),
    );
  } catch (error) {
    setLaunchError(error);
    console.error(`[Launches] ❌ ${error.message}`);
  }
}

async function collectTwilight() {
  try {
    const data = await fetchTwilight();
    updateTwilight(data);
    console.log(
      `[Twilight] ✅ Civil: ${data.civilTwilightBegin} → ${data.civilTwilightEnd}`,
    );
  } catch (error) {
    setTwilightError(error);
    console.error(`[Twilight] ❌ ${error.message}`);
  }
}

async function collectEnvironmentCanada() {
  try {
    const warnings = await fetchEnvironmentCanadaWarnings();
    updateWarnings(warnings);
    console.log(`[Env Canada] ✅ ${warnings.length} active warnings/watches`);
  } catch (error) {
    setWarningError(error);
    console.error(`[Env Canada] ❌ ${error.message}`);
  }
}

async function collectAvalanche() {
  try {
    const forecasts = await fetchAvalancheForecast();
    updateAvalanche(forecasts);
    console.log(`[Avalanche] ✅ ${forecasts.length} forecast regions`);
  } catch (error) {
    setAvalancheError(error);
    console.error(`[Avalanche] ❌ ${error.message}`);
  }
}

// ─── Start All Weather Collectors ──────────────────────────────────

export function startWeatherCollectors() {
  collectOpenMeteo();
  setTimeout(collectAirQuality, 2_000);
  setTimeout(collectTomorrowIORealtime, 4_000);
  setTimeout(collectTomorrowIODaily, 6_000);
  setTimeout(collectEarthquakes, 8_000);
  setTimeout(collectNeos, 10_000);
  setTimeout(collectDonki, 12_000);
  setTimeout(collectIssPosition, 14_000);
  setTimeout(collectAstronauts, 15_000);
  setTimeout(collectKpIndex, 16_000);
  setTimeout(collectWildfires, 18_000);
  setTimeout(collectTides, 20_000);
  setTimeout(collectSolarWind, 22_000);
  setTimeout(collectGoogleAirQuality, 24_000);
  setTimeout(collectPollen, 26_000);
  setTimeout(collectApod, 28_000);
  setTimeout(collectLaunches, 30_000);
  setTimeout(collectTwilight, 32_000);
  setTimeout(collectEnvironmentCanada, 34_000);
  setTimeout(collectAvalanche, 36_000);

  setInterval(collectOpenMeteo, OPEN_METEO_INTERVAL_MS);
  setInterval(collectAirQuality, AIR_QUALITY_INTERVAL_MS);
  setInterval(collectTomorrowIORealtime, TOMORROWIO_REALTIME_INTERVAL_MS);
  setInterval(collectTomorrowIODaily, TOMORROWIO_FORECAST_INTERVAL_MS);
  setInterval(collectEarthquakes, EARTHQUAKE_INTERVAL_MS);
  setInterval(collectNeos, NEO_INTERVAL_MS);
  setInterval(collectDonki, DONKI_INTERVAL_MS);
  setInterval(collectIssPosition, ISS_POSITION_INTERVAL_MS);
  setInterval(collectAstronauts, ISS_ASTROS_INTERVAL_MS);
  setInterval(collectKpIndex, KP_INDEX_INTERVAL_MS);
  setInterval(collectWildfires, WILDFIRE_INTERVAL_MS);
  setInterval(collectTides, TIDE_INTERVAL_MS);
  setInterval(collectSolarWind, SOLAR_WIND_INTERVAL_MS);
  setInterval(collectGoogleAirQuality, GOOGLE_AIR_QUALITY_INTERVAL_MS);
  setInterval(collectPollen, GOOGLE_POLLEN_INTERVAL_MS);
  setInterval(collectApod, APOD_INTERVAL_MS);
  setInterval(collectLaunches, LAUNCH_INTERVAL_MS);
  setInterval(collectTwilight, TWILIGHT_INTERVAL_MS);
  setInterval(collectEnvironmentCanada, ENV_CANADA_INTERVAL_MS);
  setInterval(collectAvalanche, AVALANCHE_INTERVAL_MS);

  console.log("☁️  Weather collectors started");
}

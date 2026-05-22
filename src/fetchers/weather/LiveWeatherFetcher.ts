import { WMO_WEATHER_CODES } from "../../constants.ts";
import rateLimiter from "../../services/RateLimiterService.ts";

// ─── Open-Meteo Geocoding API ──────────────────────────────────────
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// ─── Current Weather Variables ─────────────────────────────────────
const CURRENT_VARIABLES = [
  "weather_code",
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "surface_pressure",
  "is_day",
  "uv_index",
].join(",");

const DAILY_VARIABLES = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "sunrise",
  "sunset",
  "daylight_duration",
  "uv_index_max",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
].join(",");

export interface GeocodeResult {
  name: string;
  country: string;
  countryCode: string;
  admin1: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation: number | null;
  population: number | null;
}

export interface LiveWeatherOptions {
  location?: string;
  latitude?: number;
  longitude?: number;
  units?: "metric" | "imperial";
}

export interface LiveWeatherResult {
  error?: string;
  location?: {
    name?: string;
    admin1?: string | null;
    country?: string;
    countryCode?: string;
    latitude: number;
    longitude: number;
    elevation?: number | null;
    timezone: string;
    population?: number | null;
  };
  units?: {
    temperature: string;
    wind: string;
    precipitation: string;
  };
  current?: {
    time: string;
    weatherCode: number;
    weatherDescription: string;
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    cloudCover: number;
    precipitation: number;
    rain: number;
    showers: number;
    snowfall: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    pressure: number;
    isDay: boolean;
    uvIndex: number;
  };
  forecast?: Array<{
    date: string;
    weatherCode: number;
    weatherDescription: string;
    temperatureMax: number;
    temperatureMin: number;
    sunrise: string;
    sunset: string;
    daylightDuration: number;
    uvIndexMax: number;
    precipitationSum: number;
    precipitationProbabilityMax: number;
    windSpeedMax: number;
  }>;
}

interface RawGeocodeResult {
  name: string;
  country: string;
  country_code: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
  population?: number;
}

interface RawGeocodeResponse {
  results?: RawGeocodeResult[];
}

interface RawForecastResponse {
  timezone: string;
  current: {
    time: string;
    weather_code: number;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    cloud_cover: number;
    precipitation: number;
    rain: number;
    showers: number;
    snowfall: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    surface_pressure: number;
    is_day: number;
    uv_index: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    daylight_duration: number[];
    uv_index_max: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
  };
}

/**
 * Geocode a location string to lat/lon using Open-Meteo's free geocoding API.
 */
async function geocodeLocation(location: string): Promise<GeocodeResult | null> {
  await rateLimiter.wait("OPEN_METEO");

  const url = `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding API returned ${response.status}`);
  }

  const data = await response.json() as RawGeocodeResponse;
  if (!data.results || data.results.length === 0) {
    return null;
  }

  const r = data.results[0];
  return {
    name: r.name,
    country: r.country,
    countryCode: r.country_code,
    admin1: r.admin1 || null,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    elevation: r.elevation || null,
    population: r.population || null,
  };
}

/**
 * Fetch live current weather + today's forecast for any location.
 *
 * Accepts either:
 *   - A location string (geocoded via Open-Meteo)
 *   - Direct latitude/longitude coordinates
 */
export async function fetchLiveWeather({
  location,
  latitude,
  longitude,
  units = "metric"
}: LiveWeatherOptions): Promise<LiveWeatherResult> {
  let geo: GeocodeResult | null = null;

  // Resolve coordinates
  if (location) {
    geo = await geocodeLocation(location);
    if (!geo) {
      return { error: `Could not find location: "${location}"` };
    }
    latitude = geo.latitude;
    longitude = geo.longitude;
  }

  if (latitude == null || longitude == null) {
    return { error: "Either 'location' (city name) or 'latitude' + 'longitude' are required" };
  }

  // Build forecast URL
  const tempUnit = units === "imperial" ? "&temperature_unit=fahrenheit" : "";
  const windUnit = units === "imperial" ? "&wind_speed_unit=mph" : "";
  const precipUnit = units === "imperial" ? "&precipitation_unit=inch" : "";

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}&longitude=${longitude}` +
    `&current=${CURRENT_VARIABLES}` +
    `&daily=${DAILY_VARIABLES}` +
    `${tempUnit}${windUnit}${precipUnit}` +
    `&timezone=auto` +
    `&forecast_days=3`;

  await rateLimiter.wait("OPEN_METEO");
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open-Meteo forecast API returned ${response.status}`);
  }

  const data = await response.json() as RawForecastResponse;
  const current = data.current;
  const daily = data.daily;
  const weatherDescription = WMO_WEATHER_CODES[current.weather_code as unknown as keyof typeof WMO_WEATHER_CODES] || "Unknown";

  const result: LiveWeatherResult = {
    // Location info
    location: geo
      ? {
          name: geo.name,
          admin1: geo.admin1,
          country: geo.country,
          countryCode: geo.countryCode,
          latitude: geo.latitude,
          longitude: geo.longitude,
          elevation: geo.elevation,
          timezone: geo.timezone,
          population: geo.population,
        }
      : {
          latitude,
          longitude,
          timezone: data.timezone,
        },

    // Units
    units: units === "imperial"
      ? { temperature: "°F", wind: "mph", precipitation: "inch" }
      : { temperature: "°C", wind: "km/h", precipitation: "mm" },

    // Current conditions
    current: {
      time: current.time,
      weatherCode: current.weather_code,
      weatherDescription,
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      cloudCover: current.cloud_cover,
      precipitation: current.precipitation,
      rain: current.rain,
      showers: current.showers,
      snowfall: current.snowfall,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      windGust: current.wind_gusts_10m,
      pressure: current.surface_pressure,
      isDay: Boolean(current.is_day),
      uvIndex: current.uv_index,
    },

    // 3-day forecast
    forecast: daily.time
      ? daily.time.map((time, i) => ({
          date: time,
          weatherCode: daily.weather_code[i],
          weatherDescription: WMO_WEATHER_CODES[daily.weather_code[i] as unknown as keyof typeof WMO_WEATHER_CODES] || "Unknown",
          temperatureMax: daily.temperature_2m_max[i],
          temperatureMin: daily.temperature_2m_min[i],
          sunrise: daily.sunrise[i],
          sunset: daily.sunset[i],
          daylightDuration: daily.daylight_duration[i],
          uvIndexMax: daily.uv_index_max[i],
          precipitationSum: daily.precipitation_sum[i],
          precipitationProbabilityMax: daily.precipitation_probability_max[i],
          windSpeedMax: daily.wind_speed_10m_max[i],
        }))
      : [],
  };

  return result;
}

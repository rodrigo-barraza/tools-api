import CONFIG from "../../config.js";
import { TOMORROWIO_WEATHER_CODES } from "../../constants.js";

const { LATITUDE, LONGITUDE, TOMORROWIO_API_KEY } = CONFIG;

const REALTIME_URL =
  `https://api.tomorrow.io/v4/weather/realtime` +
  `?location=${LATITUDE},${LONGITUDE}` +
  `&apikey=${TOMORROWIO_API_KEY}`;

const DAILY_FORECAST_URL =
  `https://api.tomorrow.io/v4/weather/forecast` +
  `?location=${LATITUDE},${LONGITUDE}` +
  `&timesteps=1d` +
  `&apikey=${TOMORROWIO_API_KEY}`;

export async function fetchTomorrowIORealtime() {
  const response = await fetch(REALTIME_URL);

  if (!response.ok) {
    throw new Error(`Tomorrow.io realtime returned ${response.status}`);
  }

  const data = await response.json();
  const values = data.data.values;
  const weatherDescription =
    TOMORROWIO_WEATHER_CODES[values.weatherCode] || "Unknown";

  return {
    source: "tomorrowio",
    timestamp: new Date(data.data.time),

    // Core weather
    weatherCode: values.weatherCode,
    weatherDescription,
    temperature: values.temperature,
    apparentTemperature: values.temperatureApparent,
    humidity: values.humidity,
    cloudCover: values.cloudCover,
    cloudBase: values.cloudBase,
    cloudCeiling: values.cloudCeiling,
    dewPoint: values.dewPoint,
    precipitationProbability: values.precipitationProbability,
    rainIntensity: values.rainIntensity,
    snowIntensity: values.snowIntensity,
    sleetIntensity: values.sleetIntensity,
    freezingRainIntensity: values.freezingRainIntensity,
    windSpeed: values.windSpeed,
    windDirection: values.windDirection,
    windGust: values.windGust,
    visibility: values.visibility,
    uvIndex: values.uvIndex,
    uvHealthConcern: values.uvHealthConcern,
    pressure: values.pressureSeaLevel,
  };
}

export async function fetchTomorrowIODailyForecast() {
  const response = await fetch(DAILY_FORECAST_URL);

  if (!response.ok) {
    throw new Error(`Tomorrow.io daily forecast returned ${response.status}`);
  }

  const data = await response.json();
  const days = data.timelines?.daily || [];

  // Extract today's daylight data
  const today = days[0]?.values || {};

  return {
    source: "tomorrowio_daily",
    timestamp: new Date(),

    // Daylight
    sunrise: today.sunriseTime || null,
    sunset: today.sunsetTime || null,
    moonrise: today.moonriseTime || null,
    moonset: today.moonsetTime || null,

    // Daily forecast array
    dailyForecast: days.map((day) => ({
      time: day.time,
      temperatureMax: day.values.temperatureMax,
      temperatureMin: day.values.temperatureMin,
      temperatureAvg: day.values.temperatureAvg,
      precipitationProbabilityAvg: day.values.precipitationProbabilityAvg,
      precipitationProbabilityMax: day.values.precipitationProbabilityMax,
      rainAccumulationSum: day.values.rainAccumulationSum,
      snowAccumulationSum: day.values.snowAccumulationSum,
      windSpeedAvg: day.values.windSpeedAvg,
      windSpeedMax: day.values.windSpeedMax,
      windGustMax: day.values.windGustMax,
      visibilityAvg: day.values.visibilityAvg,
      visibilityMin: day.values.visibilityMin,
      uvIndexMax: day.values.uvIndexMax,
      cloudCoverAvg: day.values.cloudCoverAvg,
      humidityAvg: day.values.humidityAvg,
      sunriseTime: day.values.sunriseTime,
      sunsetTime: day.values.sunsetTime,
      moonriseTime: day.values.moonriseTime,
      moonsetTime: day.values.moonsetTime,
      weatherCodeMax: day.values.weatherCodeMax,
    })),
  };
}

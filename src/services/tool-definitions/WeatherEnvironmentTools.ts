// ────────────────────────────────────────────────────────────
// Tool Definitions — Weather & Environment
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { cached, onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";
import {
  OPEN_METEO_INTERVAL_MS,
  AVALANCHE_INTERVAL_MS
} from "../../constants.ts";

export function getWeatherEnvironmentTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_weather_forecast",
    dataSource: cached("Open-Meteo", OPEN_METEO_INTERVAL_MS),
    description: translate("get_weather_forecast.description"),
    endpoint: { path: "/weather/weather/forecast", queryParams: ["days"] },
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: translate("get_weather_forecast.params.days"),
        },
        ...fieldsParam(FIELDS.WEATHER_FORECAST),
      },
      required: ["fields"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_canada_avalanche_forecast",
    dataSource: cached("Avalanche Canada", AVALANCHE_INTERVAL_MS),
    description: translate("get_canada_avalanche_forecast.description"),
    endpoint: { path: "/weather/avalanche", queryParams: ["region"] },
    parameters: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: translate("get_canada_avalanche_forecast.params.region"),
        },
        ...fieldsParam(FIELDS.AVALANCHE),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "region",
      subjectFormat: "full",
    },
  },
  {
    name: "get_weather",
    dataSource: onDemand("Open-Meteo Geocoding + Forecast"),
    description: translate("get_weather.description"),
    endpoint: {
      path: "/weather/live",
      queryParams: ["location", "latitude", "longitude", "units"],
    },
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: translate("get_weather.params.location"),
        },
        latitude: {
          type: "number",
          description: translate("get_weather.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("get_weather.params.longitude"),
        },
        units: {
          type: "string",
          description: translate("get_weather.params.units"),
          enum: ["metric", "imperial"],
        },
      },
    },
    display: {
      activeVerb: "Fetching weather for",
      completedVerb: "Fetched weather for",
      subjectParam: "location",
      subjectFormat: "full",
    },
  },
  {
    name: "get_local_environment",
    dataSource: onDemand("Multiple APIs"),
    description: translate("get_local_environment.description"),
    endpoint: {
      path: "/weather/environment",
      queryParams: ["source"],
    },
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: translate("get_local_environment.params.source"),
          enum: [
            "current_weather",
            "air_quality",
            "earthquakes",
            "solar_activity",
            "aurora",
            "twilight",
            "tides",
            "wildfires",
            "iss",
            "neo",
            "solar_wind",
            "pollen",
            "apod",
            "launches",
            "warnings",
            "air_quality_google",
            "moon_phase",
          ],
        },
        fields: {
          type: "string",
          description: translate("get_local_environment.params.fields"),
        },
      },
      required: ["source"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "source",
      subjectFormat: "full",
    },
  },
  {
    name: "get_earthquakes",
    dataSource: onDemand("USGS Earthquake API (cached)"),
    description: translate("get_earthquakes.description"),
    endpoint: {
      path: "/weather/earthquakes/recent",
      queryParams: ["hours", "minMag", "limit", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        hours: {
          type: "number",
          description: translate("get_earthquakes.params.hours"),
        },
        minMag: {
          type: "number",
          description: translate("get_earthquakes.params.minMag"),
        },
        limit: {
          type: "number",
          description: translate("get_near_earth_objects.params.limit"),
        },
        ...fieldsParam(FIELDS.EARTHQUAKES),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_solar_activity",
    dataSource: onDemand("NASA DONKI (cached)"),
    description: translate("get_solar_activity.description"),
    endpoint: {
      path: "/weather/space-weather/summary",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.SOLAR_ACTIVITY),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_aurora_forecast",
    dataSource: onDemand("NOAA SWPC Kp Index (cached)"),
    description: translate("get_aurora_forecast.description"),
    endpoint: {
      path: "/weather/kp/current",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.AURORA),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_solar_wind",
    dataSource: onDemand("NOAA DSCOVR (cached)"),
    description: translate("get_solar_wind.description"),
    endpoint: {
      path: "/weather/solar-wind/latest",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.SOLAR_WIND),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_twilight",
    dataSource: onDemand("Sunrise-Sunset API (cached)"),
    description: translate("get_twilight.description"),
    endpoint: {
      path: "/weather/twilight",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.TWILIGHT),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_tides",
    dataSource: onDemand("NOAA Tides & Currents (cached)"),
    description: translate("get_tides.description"),
    endpoint: {
      path: "/weather/tides",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.TIDES),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_wildfires",
    dataSource: onDemand("NASA EONET (cached)"),
    description: translate("get_wildfires.description"),
    endpoint: {
      path: "/weather/wildfires",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.WILDFIRES),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_iss_location",
    dataSource: onDemand("ISS API (cached)"),
    description: translate("get_iss_location.description"),
    endpoint: {
      path: "/weather/iss",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.ISS),
      },
    },
    display: {
      activeVerb: "Locating",
      completedVerb: "Located",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_near_earth_objects",
    dataSource: onDemand("NASA NeoWs (cached)"),
    description: translate("get_near_earth_objects.description"),
    endpoint: {
      path: "/weather/neo/recent",
      queryParams: ["days", "hazardousOnly", "limit", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: translate("get_near_earth_objects.params.days"),
        },
        hazardousOnly: {
          type: "boolean",
          description: translate("get_near_earth_objects.params.hazardousOnly"),
        },
        limit: {
          type: "number",
          description: translate("get_near_earth_objects.params.limit"),
        },
        ...fieldsParam(FIELDS.NEO),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_space_launches",
    dataSource: onDemand("Launch Library 2 (cached)"),
    description: translate("get_space_launches.description"),
    endpoint: {
      path: "/weather/launches/summary",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.LAUNCHES),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_nasa_apod",
    dataSource: onDemand("NASA APOD API (cached)"),
    description: translate("get_nasa_apod.description"),
    endpoint: {
      path: "/weather/apod",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.APOD),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_moon_phase",
    dataSource: onDemand("Algorithmic (cached)"),
    description: translate("get_moon_phase.description"),
    endpoint: {
      path: "/weather/moon-phase",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.MOON_PHASE),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_canada_weather_warnings",
    dataSource: onDemand("Environment Canada"),
    description: translate("get_canada_weather_warnings.description"),
    endpoint: {
      path: "/weather/warnings",
      queryParams: ["regionCode", "fields"],
    },
    parameters: {
      type: "object",
      properties: {
        regionCode: {
          type: "string",
          description: translate("get_canada_weather_warnings.params.regionCode"),
        },
        ...fieldsParam(FIELDS.WEATHER_WARNINGS),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "regionCode",
      subjectFormat: "full",
    },
  },
  {
    name: "get_detailed_air_quality",
    dataSource: onDemand("Google Air Quality API (cached)"),
    description: translate("get_detailed_air_quality.description"),
    endpoint: {
      path: "/weather/airquality/google",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.GOOGLE_AIR_QUALITY),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_satellite_imagery",
    dataSource: onDemand("NASA Earth"),
    description: translate("get_satellite_imagery.description"),
    endpoint: {
      path: "/weather/satellite",
      queryParams: ["action", "latitude", "longitude", "date", "dimension", "startDate", "endDate"],
    },
    parameters: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
          description: translate("get_satellite_imagery.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("get_satellite_imagery.params.longitude"),
        },
        action: {
          type: "string",
          enum: ["imagery", "assets"],
          description: translate("get_satellite_imagery.params.action"),
        },
        date: {
          type: "string",
          description: translate("get_satellite_imagery.params.date"),
        },
        dimension: {
          type: "number",
          description: translate("get_satellite_imagery.params.dimension"),
        },
      },
      required: ["latitude", "longitude"],
    },
    display: {
      activeVerb: "Fetching satellite imagery",
      completedVerb: "Fetched satellite imagery",
      subjectParam: "date",
      subjectFormat: "full",
    },
  },
  ];
}

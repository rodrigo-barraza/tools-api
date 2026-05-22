/**
 * Weather & Space Weather TypeScript Definitions
 */

// ─── OpenMeteo Types ──────────────────────────────────────────────

export interface OpenMeteoHourlyForecast {
  time: string;
  temperature: number;
  relativeHumidity: number;
  dewpoint: number;
  apparentTemperature: number;
  precipitationProbability: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  snowDepth: number;
  weatherCode: number;
  seaLevelPressure: number;
  surfacePressure: number;
  cloudCover: number;
  cloudCoverLow: number;
  cloudCoverMid: number;
  cloudCoverHigh: number;
  visibility: number;
  evapotranspiration: number;
  referenceEvapotranspiration: number;
  vapourPressureDeficit: number;
  windSpeed10m: number;
  windSpeed80m: number;
  windSpeed120m: number;
  windSpeed180m: number;
  windDirection10m: number;
  windDirection80m: number;
  windDirection120m: number;
  windDirection180m: number;
  windGusts10m: number;
  temperature80m: number;
  temperature120m: number;
  temperature180m: number;
  soilTemperature0cm: number;
  soilTemperature6cm: number;
  soilTemperature18cm: number;
  soilTemperature54cm: number;
  soilMoisture0to1cm: number;
  soilMoisture1to3cm: number;
  soilMoisture3to9cm: number;
  soilMoisture9to27cm: number;
  soilMoisture27to81cm: number;
  uvIndex: number;
}

export interface OpenMeteoDailyForecast {
  time: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  sunrise: string;
  sunset: string;
  daylightDuration: number;
  uvIndexMax: number;
  precipitationSum: number;
  windSpeed10m_max?: number;
  windSpeedMax?: number;
}

export interface OpenMeteoResponse {
  source: string;
  timestamp: Date;
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
  sunrise: string | null;
  sunset: string | null;
  daylightDuration: number | null;
  hourlyForecast: OpenMeteoHourlyForecast[];
  dailyForecast: OpenMeteoDailyForecast[];
}

// ─── Tomorrow.io Types ───────────────────────────────────────────

export interface TomorrowIORealtimeResponse {
  source: string;
  timestamp: Date;
  weatherCode: number;
  weatherDescription: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  cloudCover: number;
  cloudBase: number | null;
  cloudCeiling: number | null;
  dewPoint: number;
  precipitationProbability: number;
  rainIntensity: number;
  snowIntensity: number;
  sleetIntensity: number;
  freezingRainIntensity: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  visibility: number;
  uvIndex: number;
  uvHealthConcern: number;
  pressure: number;
}

export interface TomorrowIODailyForecast {
  time: string;
  temperatureMax: number;
  temperatureMin: number;
  temperatureAvg: number;
  precipitationProbabilityAvg: number;
  precipitationProbabilityMax: number;
  rainAccumulationSum: number;
  snowAccumulationSum: number;
  windSpeedAvg: number;
  windSpeedMax: number;
  windGustMax: number;
  visibilityAvg: number;
  visibilityMin: number;
  uvIndexMax: number;
  cloudCoverAvg: number;
  humidityAvg: number;
  sunriseTime: string | null;
  sunsetTime: string | null;
  moonriseTime: string | null;
  moonsetTime: string | null;
  weatherCodeMax: number;
}

export interface TomorrowIODailyForecastResponse {
  source: string;
  timestamp: Date;
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
  dailyForecast: TomorrowIODailyForecast[];
}

// ─── Earthquake Types ────────────────────────────────────────────

export interface EarthquakeRecord {
  usgsId: string;
  magnitude: number | null;
  magnitudeType: string | null;
  magnitudeClass: string;
  place: string | null;
  time: Date | null;
  updated: Date | null;
  url: string | null;
  detailUrl: string | null;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: string | null;
  status: string | null;
  tsunami: boolean;
  significance: number | null;
  net: string | null;
  code: string | null;
  nst: number | null;
  dmin: number | null;
  rms: number | null;
  gap: number | null;
  type: string | null;
  title: string | null;
  longitude: number;
  latitude: number;
  depth: number;
  [key: string]: unknown;
}

// ─── Space Weather Types ─────────────────────────────────────────

export interface KpReading {
  time: Date;
  kp: number;
  aRunning: number;
  stationCount: number;
}

export interface SolarWindPlasmaReading {
  time: string;
  density: number | null;
  speed: number | null;
  temperature: number | null;
  [key: string]: string | number | null;
}

export interface SolarWindMagReading {
  time: string;
  bx: number | null;
  by: number | null;
  bz: number | null;
  lonGsm: number | null;
  latGsm: number | null;
  bt: number | null;
  [key: string]: string | number | null;
}

export interface SolarWindLatest {
  time: string | null;
  speed: number | null;
  density: number | null;
  temperature: number | null;
  bz: number | null;
  bt: number | null;
  bx: number | null;
  by: number | null;
}

export interface SolarWindResponse {
  plasma: SolarWindPlasmaReading[];
  magnetic: SolarWindMagReading[];
  latest: SolarWindLatest;
  counts: {
    plasma: number;
    magnetic: number;
  };
}

// ─── Launch Types ─────────────────────────────────────────────────

export interface RawLaunch {
  id: string;
  name: string;
  slug: string;
  status?: {
    name?: string | null;
    abbrev?: string | null;
  } | null;
  net: string;
  window_start?: string;
  window_end?: string;
  probability?: number | null;
  weather_concerns?: string | null;
  launch_service_provider?: {
    name?: string | null;
    abbrev?: string | null;
  } | null;
  rocket?: {
    configuration?: {
      full_name?: string | null;
    } | null;
  } | null;
  mission?: {
    name?: string | null;
    type?: string | null;
    description?: string | null;
    orbit?: {
      name?: string | null;
    } | null;
  } | null;
  pad?: {
    name?: string | null;
    location?: {
      name?: string | null;
    } | null;
  } | null;
  image?: {
    image_url?: string | null;
  } | null;
  webcast_live?: boolean;
  url?: string;
}

export interface Launch {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  statusAbbrev: string | null;
  net: string;
  windowStart: string;
  windowEnd: string;
  probability: number | null;
  weatherConcerns: string | null;
  provider: string | null;
  providerAbbrev: string | null;
  rocket: string | null;
  mission: string | null;
  missionType: string | null;
  missionDescription: string | null;
  orbit: string | null;
  padName: string | null;
  padLocation: string | null;
  imageUrl: string | null;
  webcastUrl: string | null;
}

// ─── Wildfire Types ───────────────────────────────────────────────

export interface RawWildfireEvent {
  id: string;
  title: string;
  description?: string | null;
  closed?: boolean;
  geometry?: Array<{
    coordinates?: [number, number];
    magnitudeValue?: number | null;
    magnitudeUnit?: string | null;
    date?: string | null;
  }>;
  sources?: Array<{
    id?: string | null;
    url?: string | null;
  }>;
}

export interface WildfireEvent {
  eonetId: string;
  title: string;
  description: string | null;
  status: "closed" | "open";
  coordinates: { lng: number; lat: number } | null;
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  date: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
}

// ─── Air Quality Types ────────────────────────────────────────────

export interface RawGoogleAqiIndex {
  code?: string;
  displayName?: string;
  aqi?: number;
  category?: string;
  dominantPollutant?: string;
  color?: {
    red?: number;
    green?: number;
    blue?: number;
  };
}

export interface RawGooglePollutant {
  code: string;
  displayName?: string;
  concentration?: {
    value?: number;
    units?: string;
  };
  additionalInfo?: {
    sources?: string;
    effects?: string;
  };
}

export interface RawGoogleAirQualityResponse {
  dateTime?: string;
  regionCode?: string;
  indexes?: RawGoogleAqiIndex[];
  pollutants?: RawGooglePollutant[];
  healthRecommendations?: {
    generalPopulation?: string;
    elderly?: string;
    children?: string;
    athletes?: string;
    pregnantWomen?: string;
    [key: string]: string | undefined;
  };
}

export interface GoogleAirQualityPollutant {
  displayName: string | null;
  concentration: number | null;
  unit: string | null;
  sources: string | null;
  effects: string | null;
}

export interface GoogleAqiIndex {
  code: string;
  displayName: string | null;
  aqi: number | null;
  category: string | null;
  dominantPollutant: string | null;
  color: { red?: number; green?: number; blue?: number } | null;
}

export interface GoogleAirQuality {
  source: "google_airquality";
  timestamp: Date;
  regionCode: string | null;
  universalAqi: number | null;
  universalAqiCategory: string | null;
  universalAqiDominantPollutant: string | null;
  universalAqiColor: { red?: number; green?: number; blue?: number } | null;
  usEpaAqi: number | null;
  usEpaCategory: string | null;
  usEpaDominantPollutant: string | null;
  usEpaColor: { red?: number; green?: number; blue?: number } | null;
  indexes: GoogleAqiIndex[];
  pollutants: Record<string, GoogleAirQualityPollutant>;
  healthRecommendations: {
    generalPopulation?: string;
    elderly?: string;
    children?: string;
    athletes?: string;
    pregnantWomen?: string;
    [key: string]: string | undefined;
  } | null;
}

export interface AirQualityHourly {
  time: string;
  usAqi: number;
  pm25: number;
  pm10: number;
  uvIndex: number;
}

export interface AirQuality {
  source: "airquality";
  timestamp: Date;
  usAqi: number;
  europeanAqi: number;
  pm25: number;
  pm10: number;
  carbonMonoxide: number;
  nitrogenDioxide: number;
  ozone: number;
  dust: number;
  uvIndex: number;
  hourlyAirQuality: AirQualityHourly[];
}



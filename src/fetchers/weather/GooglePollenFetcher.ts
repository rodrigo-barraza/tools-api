import CONFIG from "../../config.ts";

const API_URL = "https://pollen.googleapis.com/v1/forecast:lookup";

export interface PollenIndexInfo {
  value: number | null;
  category: string | null;
  indexDescription: string | null;
  color: { red?: number; green?: number; blue?: number } | null;
}

export interface PollenTypeDetails {
  displayName: string;
  indexInfo: PollenIndexInfo | null;
  inSeason: boolean;
  healthRecommendations: string[];
}

export interface PlantContribution {
  code: string;
  displayName: string;
  inSeason: boolean;
  indexInfo: PollenIndexInfo | null;
  description: string | null;
  crossReaction: string | null;
  season: string | null;
}

export interface PollenDailyForecast {
  date: string | null;
  grass: PollenTypeDetails | null;
  tree: PollenTypeDetails | null;
  weed: PollenTypeDetails | null;
  plants: PlantContribution[];
}

export interface PollenResponse {
  source: string;
  timestamp: Date;
  regionCode: string | null;
  daily: PollenDailyForecast[];
}

interface RawGoogleColor {
  red?: number;
  green?: number;
  blue?: number;
}

interface RawGooglePollenIndexInfo {
  value?: number;
  category?: string;
  indexDescription?: string;
  color?: RawGoogleColor;
}

interface RawGooglePollenTypeInfo {
  code?: string;
  displayName?: string;
  indexInfo?: RawGooglePollenIndexInfo;
  inSeason?: boolean;
  healthRecommendations?: string[];
}

interface RawGooglePlantInfo {
  code?: string;
  displayName?: string;
  inSeason?: boolean;
  indexInfo?: RawGooglePollenIndexInfo;
  plantDescription?: {
    type?: string;
    crossReaction?: string;
    season?: string;
  };
}

interface RawGoogleDailyInfo {
  date?: {
    year: number;
    month: number;
    day: number;
  };
  pollenTypeInfo?: RawGooglePollenTypeInfo[];
  plantInfo?: RawGooglePlantInfo[];
}

interface RawGooglePollenResponse {
  regionCode?: string;
  dailyInfo?: RawGoogleDailyInfo[];
}

/**
 * Fetch pollen forecast from Google Pollen API.
 * Returns daily pollen indexes for grass, tree, and weed with plant breakdowns.
 */
export async function fetchPollen(): Promise<PollenResponse> {
  if (!CONFIG.GOOGLE_CLOUD_GEMINI_API_KEY) {
    throw new Error("GOOGLE_CLOUD_GEMINI_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    key: CONFIG.GOOGLE_CLOUD_GEMINI_API_KEY,
    "location.latitude": CONFIG.LATITUDE.toString(),
    "location.longitude": CONFIG.LONGITUDE.toString(),
    days: "5",
    languageCode: "en",
    plantsDescription: "true",
  });

  const response = await fetch(`${API_URL}?${params}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Pollen API returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as RawGooglePollenResponse;
  const dailyInfo = data.dailyInfo || [];

  return {
    source: "pollen",
    timestamp: new Date(),
    regionCode: data.regionCode || null,

    // Daily forecasts
    daily: dailyInfo.map((day): PollenDailyForecast => {
      const pollenTypes = day.pollenTypeInfo || [];
      const plantInfo = day.plantInfo || [];

      // Extract index for each pollen type
      const byType: Record<string, PollenTypeDetails> = {};
      for (const pt of pollenTypes) {
        const key =
          pt.code?.toLowerCase() || pt.displayName?.toLowerCase() || "";
        if (!key) continue;
        byType[key] = {
          displayName: pt.displayName || "",
          indexInfo: pt.indexInfo
            ? {
                value: pt.indexInfo.value ?? null,
                category: pt.indexInfo.category ?? null,
                indexDescription: pt.indexInfo.indexDescription ?? null,
                color: pt.indexInfo.color ?? null,
              }
            : null,
          inSeason: pt.inSeason ?? false,
          healthRecommendations: pt.healthRecommendations || [],
        };
      }

      // Extract individual plant contributions
      const plants = plantInfo.map(
        (rawGooglePlantInfo): PlantContribution => ({
          code: rawGooglePlantInfo.code || "",
          displayName: rawGooglePlantInfo.displayName || "",
          inSeason: rawGooglePlantInfo.inSeason ?? false,
          indexInfo: rawGooglePlantInfo.indexInfo
            ? {
                value: rawGooglePlantInfo.indexInfo.value ?? null,
                category: rawGooglePlantInfo.indexInfo.category ?? null,
                indexDescription: rawGooglePlantInfo.indexInfo.indexDescription ?? null,
                color: rawGooglePlantInfo.indexInfo.color ?? null,
              }
            : null,
          description: rawGooglePlantInfo.plantDescription?.type ?? null,
          crossReaction: rawGooglePlantInfo.plantDescription?.crossReaction ?? null,
          season: rawGooglePlantInfo.plantDescription?.season ?? null,
        }),
      );

      return {
        date: day.date
          ? `${day.date.year}-${String(day.date.month).padStart(2, "0")}-${String(day.date.day).padStart(2, "0")}`
          : null,
        grass: byType.grass || null,
        tree: byType.tree || null,
        weed: byType.weed || null,
        plants,
      };
    }),
  };
}

import CONFIG from "../../config.ts";
import {
  GoogleAirQuality,
  GoogleAirQualityPollutant,
  RawGoogleAirQualityResponse,
  RawGoogleAqiIndex,
} from "../../types/weather.ts";

const API_URL = "https://airquality.googleapis.com/v1/currentConditions:lookup";

/**
 * Fetch current air quality from Google Air Quality API.
 * Returns AQI with health recommendations, dominant pollutant, and color codes.
 * Complements the existing Open-Meteo AQ data with richer insights.
 */
export async function fetchGoogleAirQuality(): Promise<GoogleAirQuality> {
  if (!CONFIG.GOOGLE_CLOUD_GEMINI_API_KEY) {
    throw new Error("GOOGLE_CLOUD_GEMINI_API_KEY is not configured");
  }

  const response = await fetch(`${API_URL}?key=${CONFIG.GOOGLE_CLOUD_GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: {
        latitude: CONFIG.LATITUDE,
        longitude: CONFIG.LONGITUDE,
      },
      extraComputations: [
        "HEALTH_RECOMMENDATIONS",
        "DOMINANT_POLLUTANT_CONCENTRATION",
        "POLLUTANT_CONCENTRATION",
        "POLLUTANT_ADDITIONAL_INFO",
      ],
      languageCode: "en",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Air Quality API returned ${response.status}: ${text}`,
    );
  }

  const data = (await response.json()) as RawGoogleAirQualityResponse;
  const indexes = data.indexes || [];
  const pollutants = data.pollutants || [];

  // Find the universal AQI (uaqi) and US AQI
  const uaqi = indexes.find((i) => i.code === "uaqi");
  const usAqi = indexes.find((i) => i.code === "usa_epa");

  // Build pollutant map
  const pollutantMap: Record<string, GoogleAirQualityPollutant> = {};
  for (const rawGooglePollutant of pollutants) {
    pollutantMap[rawGooglePollutant.code] = {
      displayName: rawGooglePollutant.displayName ?? null,
      concentration: rawGooglePollutant.concentration?.value ?? null,
      unit: rawGooglePollutant.concentration?.units ?? null,
      sources: rawGooglePollutant.additionalInfo?.sources ?? null,
      effects: rawGooglePollutant.additionalInfo?.effects ?? null,
    };
  }

  return {
    source: "google_airquality",
    timestamp: data.dateTime ? new Date(data.dateTime) : new Date(),
    regionCode: data.regionCode || null,

    // Universal AQI
    universalAqi: uaqi?.aqi ?? null,
    universalAqiCategory: uaqi?.category ?? null,
    universalAqiDominantPollutant: uaqi?.dominantPollutant ?? null,
    universalAqiColor: uaqi?.color ?? null,

    // US EPA AQI
    usEpaAqi: usAqi?.aqi ?? null,
    usEpaCategory: usAqi?.category ?? null,
    usEpaDominantPollutant: usAqi?.dominantPollutant ?? null,
    usEpaColor: usAqi?.color ?? null,

    // All AQI indexes
    indexes: indexes.map((index: RawGoogleAqiIndex) => ({
      code: index.code || "",
      displayName: index.displayName ?? null,
      aqi: index.aqi ?? null,
      category: index.category ?? null,
      dominantPollutant: index.dominantPollutant ?? null,
      color: index.color ?? null,
    })),

    // Pollutant details
    pollutants: pollutantMap,

    // Health recommendations
    healthRecommendations: data.healthRecommendations || null,
  };
}

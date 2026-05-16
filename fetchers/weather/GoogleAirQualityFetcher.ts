import CONFIG from "../../config.js";

const API_URL = "https://airquality.googleapis.com/v1/currentConditions:lookup";

/**
 * Fetch current air quality from Google Air Quality API.
 * Returns AQI with health recommendations, dominant pollutant, and color codes.
 * Complements the existing Open-Meteo AQ data with richer insights.
 */
export async function fetchGoogleAirQuality() {
  if (!CONFIG.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  const response = await fetch(`${API_URL}?key=${CONFIG.GOOGLE_API_KEY}`, {
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

  const data = await response.json();
  const indexes = data.indexes || [];
  const pollutants = data.pollutants || [];

  // Find the universal AQI (uaqi) and US AQI
  const uaqi = indexes.find((i) => i.code === "uaqi");
  const usAqi = indexes.find((i) => i.code === "usa_epa");

  // Build pollutant map
  const pollutantMap = {};
  for (const p of pollutants) {
    pollutantMap[p.code] = {
      displayName: p.displayName,
      concentration: p.concentration?.value ?? null,
      unit: p.concentration?.units ?? null,
      sources: p.additionalInfo?.sources ?? null,
      effects: p.additionalInfo?.effects ?? null,
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
    indexes: indexes.map((idx) => ({
      code: idx.code,
      displayName: idx.displayName,
      aqi: idx.aqi,
      category: idx.category,
      dominantPollutant: idx.dominantPollutant,
      color: idx.color,
    })),

    // Pollutant details
    pollutants: pollutantMap,

    // Health recommendations
    healthRecommendations: data.healthRecommendations || null,
  };
}

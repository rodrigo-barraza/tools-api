import CONFIG from "../../config.js";

const API_URL = "https://pollen.googleapis.com/v1/forecast:lookup";

/**
 * Fetch pollen forecast from Google Pollen API.
 * Returns daily pollen indexes for grass, tree, and weed with plant breakdowns.
 */
export async function fetchPollen() {
  if (!CONFIG.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    key: CONFIG.GOOGLE_API_KEY,
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

  const data = await response.json();
  const dailyInfo = data.dailyInfo || [];

  return {
    source: "pollen",
    timestamp: new Date(),
    regionCode: data.regionCode || null,

    // Daily forecasts
    daily: dailyInfo.map((day) => {
      const pollenTypes = day.pollenTypeInfo || [];
      const plantInfo = day.plantInfo || [];

      // Extract index for each pollen type
      const byType = {};
      for (const pt of pollenTypes) {
        byType[pt.code?.toLowerCase() || pt.displayName?.toLowerCase()] = {
          displayName: pt.displayName,
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
      const plants = plantInfo.map((p) => ({
        code: p.code,
        displayName: p.displayName,
        inSeason: p.inSeason ?? false,
        indexInfo: p.indexInfo
          ? {
              value: p.indexInfo.value ?? null,
              category: p.indexInfo.category ?? null,
              indexDescription: p.indexInfo.indexDescription ?? null,
              color: p.indexInfo.color ?? null,
            }
          : null,
        description: p.plantDescription?.type ?? null,
        crossReaction: p.plantDescription?.crossReaction ?? null,
        season: p.plantDescription?.season ?? null,
      }));

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

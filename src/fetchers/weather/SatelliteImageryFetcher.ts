// ─── NASA Earth Satellite Imagery Fetcher ──────────────────────────
// Uses NASA Earth Assets API (free, requires NASA_API_KEY).

const NASA_EARTH_API_BASE = "https://api.nasa.gov/planetary/earth";

interface SatelliteImageryResult {
  latitude: number;
  longitude: number;
  date: string;
  imageUrl: string;
  cloudScore: number | null;
  id: string;
}

interface SatelliteAssetsResult {
  latitude: number;
  longitude: number;
  count: number;
  availableDates: string[];
}

export async function getSatelliteImagery(
  latitude: number,
  longitude: number,
  apiKey: string,
  date?: string,
  dimension?: number,
): Promise<SatelliteImageryResult> {
  const queryParams = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    api_key: apiKey,
  });

  if (date) queryParams.set("date", date);
  if (dimension) queryParams.set("dim", String(dimension));

  const response = await fetch(
    `${NASA_EARTH_API_BASE}/imagery?${queryParams}`,
    { signal: AbortSignal.timeout(30_000) },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `NASA Earth API error ${response.status}: ${errorBody}`,
    );
  }

  const responseData = (await response.json()) as {
    date: string;
    url: string;
    cloud_score: number | null;
    id: string;
  };

  return {
    latitude,
    longitude,
    date: responseData.date,
    imageUrl: responseData.url,
    cloudScore: responseData.cloud_score,
    id: responseData.id,
  };
}

export async function getSatelliteAssets(
  latitude: number,
  longitude: number,
  apiKey: string,
  startDate?: string,
  endDate?: string,
): Promise<SatelliteAssetsResult> {
  const queryParams = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    api_key: apiKey,
  });

  if (startDate) queryParams.set("begin", startDate);
  if (endDate) queryParams.set("end", endDate);

  const response = await fetch(
    `${NASA_EARTH_API_BASE}/assets?${queryParams}`,
    { signal: AbortSignal.timeout(15_000) },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `NASA Earth Assets API error ${response.status}: ${errorBody}`,
    );
  }

  const responseData = (await response.json()) as {
    count: number;
    results: Array<{ date: string }>;
  };

  return {
    latitude,
    longitude,
    count: responseData.count,
    availableDates: (responseData.results || []).map(
      (assetResult) => assetResult.date,
    ),
  };
}

import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const GEOJSON_URL =
  "https://www.511virginia.org/data/geojson/icons.cameras.geojson";

interface VirginiaFeature {
  type: string;
  properties: {
    id?: string | number;
    name?: string;
    description?: string;
    https_url?: string;
    url?: string;
  };
  geometry?: {
    type: string;
    coordinates?: [number, number];
  };
}

interface VirginiaGeoJSON {
  type: string;
  features: VirginiaFeature[];
}

export async function refreshVirginiaWebcams() {
  const response = await fetch(GEOJSON_URL, {
    headers: {
      "User-Agent": "tools-service/1.0",
      Accept: "application/geo+json, application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Virginia webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as VirginiaGeoJSON;
  if (!data.features || data.features.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data.features
    .map((feature: VirginiaFeature): WebcamDocument => {
      const properties = feature.properties;
      const longitude = feature.geometry?.coordinates?.[0] ?? null;
      const latitude = feature.geometry?.coordinates?.[1] ?? null;

      return {
        id: `VA-${properties.id}`,
        name: properties.name || properties.description || `Camera ${properties.id}`,
        url: properties.https_url || properties.url || "",
        area: properties.description || "Virginia",
        latitude,
        longitude,
        city: "Virginia",
        country: "US",
        source: "511virginia.org",
      };
    })
    .filter((webcam: WebcamDocument) => !!(webcam.url));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

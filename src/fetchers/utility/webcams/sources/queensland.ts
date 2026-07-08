import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL =
  "https://api.qldtraffic.qld.gov.au/v2/webcams";

interface QLDWebcamFeature {
  type: string;
  properties: {
    id?: string | number;
    description?: string;
    name?: string;
    url?: string;
    image_url?: string;
    direction?: string;
    locality?: string;
    road_summary?: string;
  };
  geometry?: {
    type: string;
    coordinates?: [number, number];
  };
}

interface QLDGeoJSON {
  type: string;
  features: QLDWebcamFeature[];
}

export async function refreshQueenslandWebcams() {
  const response = await fetch(API_URL, {
    headers: {
      ...buildScraperHeaders(),
      Accept: "application/geo+json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Queensland webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as QLDGeoJSON;
  if (!data.features || data.features.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data.features
    .map((feature: QLDWebcamFeature): WebcamDocument => {
      const properties = feature.properties;
      const longitude = feature.geometry?.coordinates?.[0] ?? null;
      const latitude = feature.geometry?.coordinates?.[1] ?? null;

      return {
        id: `QLD-${properties.id}`,
        name:
          properties.description ||
          properties.name ||
          `Camera ${properties.id}`,
        url: properties.image_url || properties.url || "",
        area: properties.locality || properties.road_summary || "Queensland",
        latitude,
        longitude,
        city: "Queensland",
        country: "AU",
        source: "qldtraffic.qld.gov.au",
      };
    })
    .filter((webcam: WebcamDocument) => !!(webcam.url || (webcam.latitude && webcam.longitude)));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

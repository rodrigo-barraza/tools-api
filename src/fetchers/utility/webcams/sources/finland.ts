import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL =
  "https://tie.digitraffic.fi/api/weathercam/v1/stations";

interface DigittrafficPreset {
  id: string;
  presentationName?: string;
  imageUrl?: string;
}

interface DigittrafficStation {
  id: string;
  name?: string;
  cameraPresets?: DigittrafficPreset[];
  latitude?: number;
  longitude?: number;
  nearestWeatherStationId?: string;
}

interface DigittrafficResponse {
  features?: Array<{
    type: string;
    id: string;
    geometry?: {
      type: string;
      coordinates?: [number, number, number?];
    };
    properties?: DigittrafficStation;
  }>;
}

export async function refreshFinlandWebcams() {
  const response = await fetch(API_URL, {
    headers: {
      ...buildScraperHeaders(),
      "Digitraffic-User": "tools-service/1.0",
      "Accept-Encoding": "gzip",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Finland weathercams: ${response.status}`,
    );
  }

  const data = (await response.json()) as DigittrafficResponse;
  if (!data.features || data.features.length === 0) return;

  const allParsedWebcams: WebcamDocument[] = [];

  for (const feature of data.features) {
    const properties = feature.properties;
    if (!properties) continue;

    const longitude = feature.geometry?.coordinates?.[0] ?? null;
    const latitude = feature.geometry?.coordinates?.[1] ?? null;

    const presets = properties.cameraPresets || [];
    if (presets.length === 0) {
      allParsedWebcams.push({
        id: `FI-${properties.id}`,
        name: properties.name || `Station ${properties.id}`,
        url: "",
        area: properties.name || "Finland",
        latitude,
        longitude,
        city: "Finland",
        country: "FI",
        source: "digitraffic.fi",
      });
    } else {
      for (const preset of presets) {
        allParsedWebcams.push({
          id: `FI-${preset.id}`,
          name:
            preset.presentationName ||
            properties.name ||
            `Camera ${preset.id}`,
          url: preset.imageUrl || `https://weathercam.digitraffic.fi/${preset.id}.jpg`,
          area: properties.name || "Finland",
          latitude,
          longitude,
          city: "Finland",
          country: "FI",
          source: "digitraffic.fi",
        });
      }
    }
  }

  const validWebcams = allParsedWebcams.filter(
    (webcam) => !!(webcam.url || (webcam.latitude && webcam.longitude)),
  );

  if (validWebcams.length > 0) {
    await upsertWebcams(validWebcams);
  }
}

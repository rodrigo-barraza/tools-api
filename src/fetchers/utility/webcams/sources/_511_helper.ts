import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

/**
 * Shared fetcher for 511-style camera APIs (Ontario, Alberta, etc.).
 * These APIs return JSON arrays of camera objects with Views arrays
 * containing CCTV page URLs.
 */
interface Fetch511CamerasParams {
  apiUrl: string;
  city: string;
  country: string;
  source: string;
  idPrefix: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

interface CameraView {
  Id: number | string;
  Status: string;
  Description?: string;
  Url: string;
}

interface CameraItem {
  Id: number | string;
  Latitude: number;
  Longitude: number;
  Location?: string;
  Roadway?: string;
  Views: CameraView[];
}

export async function fetch511Cameras({
  apiUrl,
  city,
  country,
  source,
  idPrefix,
  bounds,
}: Fetch511CamerasParams) {
  const url = `${apiUrl}?format=json`;
  const response = await fetch(url, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${city} webcams from ${source}: ${response.status}`,
    );
  }

  const data = (await response.json()) as CameraItem[];
  if (!Array.isArray(data) || data.length === 0) {
    return;
  }

  const parsedWebcams: WebcamDocument[] = [];

  for (const cam of data) {
    const lat = cam.Latitude;
    const lon = cam.Longitude;

    // Filter by geographic bounding box
    if (bounds) {
      if (
        lat < bounds.minLat ||
        lat > bounds.maxLat ||
        lon < bounds.minLon ||
        lon > bounds.maxLon
      ) {
        continue;
      }
    }

    // Each camera can have multiple views
    if (!cam.Views || cam.Views.length === 0) continue;

    for (const view of cam.Views) {
      if (view.Status !== "Enabled") continue;

      parsedWebcams.push({
        id: `${idPrefix}-${view.Id}`,
        name: `${cam.Location || cam.Roadway || `Camera ${cam.Id}`}${view.Description ? ` (${view.Description})` : ""}`.trim(),
        url: view.Url,
        area: cam.Roadway || city,
        latitude: lat,
        longitude: lon,
        city,
        country,
        source,
      });
    }
  }

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

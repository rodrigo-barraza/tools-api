import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://data.honolulu.gov/resource/cat5-2v98.json";

interface HonoluluCamera {
  objectid?: string | number;
  location?: string;
  image_url?: string;
  url?: string;
  latitude?: string | number;
  longitude?: string | number;
}

export async function refreshHonoluluWebcams() {
  const response = await fetch(`${API_URL}?$limit=500`, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Honolulu webcams: ${response.status}`);
  }

  const data = (await response.json()) as HonoluluCamera[];
  if (!Array.isArray(data) || data.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data
    .map((cam: HonoluluCamera): WebcamDocument => ({
      id: `HNL-${cam.objectid}`,
      name: cam.location || `Camera ${cam.objectid}`,
      url: cam.image_url || cam.url || "",
      area: cam.location || "Honolulu",
      latitude: cam.latitude ? Number(cam.latitude) : null,
      longitude: cam.longitude ? Number(cam.longitude) : null,
      city: "Honolulu",
      country: "US",
      source: "data.honolulu.gov",
    }))
    .filter((webcam: WebcamDocument) => !!(webcam.url || (webcam.latitude && webcam.longitude)));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

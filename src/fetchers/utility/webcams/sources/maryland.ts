import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://chart.maryland.gov/DataFeeds/GetCamerasJson";

interface MarylandCamera {
  id?: string | number;
  cameraId?: string | number;
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
  imageUrl?: string;
  videoUrl?: string;
}

export async function refreshMarylandWebcams() {
  const response = await fetch(API_URL, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Maryland webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as MarylandCamera[];
  if (!Array.isArray(data) || data.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data
    .map((cam: MarylandCamera): WebcamDocument => ({
      id: `MD-${cam.cameraId || cam.id}`,
      name: cam.name || cam.description || `Camera ${cam.cameraId || cam.id}`,
      url: cam.imageUrl || cam.videoUrl || cam.url || "",
      area: cam.description || "Maryland",
      latitude: cam.latitude ?? null,
      longitude: cam.longitude ?? null,
      city: "Maryland",
      country: "US",
      source: "chart.maryland.gov",
    }))
    .filter((webcam: WebcamDocument) => !!(webcam.url || (webcam.latitude && webcam.longitude)));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://publicapi.ohgo.com/api/v1/cameras";

interface OhioCamera {
  id?: string | number;
  cameraId?: string | number;
  description?: string;
  latitude?: number;
  longitude?: number;
  roadway?: string;
  largeImageUrl?: string;
  smallImageUrl?: string;
}

interface OhioResponse {
  results?: OhioCamera[];
}

export async function refreshOhioWebcams() {
  const response = await fetch(API_URL, {
    headers: {
      ...buildScraperHeaders(),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Ohio webcams: ${response.status}`);
  }

  const data = (await response.json()) as OhioResponse;
  const cameras = data.results || (data as unknown as OhioCamera[]);
  if (!Array.isArray(cameras) || cameras.length === 0) return;

  const parsedWebcams: WebcamDocument[] = cameras
    .map((cam: OhioCamera): WebcamDocument => ({
      id: `OH-${cam.cameraId || cam.id}`,
      name: cam.description || `Camera ${cam.cameraId || cam.id}`,
      url: cam.largeImageUrl || cam.smallImageUrl || "",
      area: cam.roadway || "Ohio",
      latitude: cam.latitude ?? null,
      longitude: cam.longitude ?? null,
      city: "Ohio",
      country: "US",
      source: "publicapi.ohgo.com",
    }))
    .filter((webcam: WebcamDocument) => !!(webcam.url || (webcam.latitude && webcam.longitude)));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

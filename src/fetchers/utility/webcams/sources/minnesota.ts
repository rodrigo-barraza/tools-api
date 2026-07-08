import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://tr.511mn.org/tgcameras/api/cameras";

interface MinnesotaCamera {
  id?: string | number;
  cameraId?: string | number;
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  videoUrl?: string;
  url?: string;
  roadway?: string;
  direction?: string;
}

export async function refreshMinnesotaWebcams() {
  const response = await fetch(API_URL, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Minnesota webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as MinnesotaCamera[];
  if (!Array.isArray(data) || data.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data
    .map((cam: MinnesotaCamera): WebcamDocument => {
      const cameraIdentifier = cam.cameraId || cam.id;

      return {
        id: `MN-${cameraIdentifier}`,
        name: cam.name || cam.description || `Camera ${cameraIdentifier}`,
        url: cam.imageUrl || cam.videoUrl || cam.url || "",
        area: cam.roadway || "Minnesota",
        latitude: cam.latitude ?? null,
        longitude: cam.longitude ?? null,
        city: "Minnesota",
        country: "US",
        source: "tr.511mn.org",
      };
    })
    .filter((webcam: WebcamDocument) => !!(webcam.url || (webcam.latitude && webcam.longitude)));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

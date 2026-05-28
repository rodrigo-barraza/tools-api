import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://data.brla.gov/resource/6z6u-ts44.json";

interface BatonRougeCamera {
  image_view?: string;
  device_id?: string | number;
  _id?: string | number;
  device_name?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
}

export async function refreshBatonRougeWebcams() {
  const response = await fetch(`${API_URL}?$limit=500`, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Baton Rouge webcams: ${response.status}`);
  }

  const data = (await response.json()) as BatonRougeCamera[];
  if (!Array.isArray(data) || data.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data
    .filter(
      (
        cam: BatonRougeCamera,
      ): cam is BatonRougeCamera & { image_view: string } => !!cam.image_view,
    )
    .map(
      (cam: BatonRougeCamera & { image_view: string }): WebcamDocument => ({
        id: `BTR-${cam.device_id || cam._id}`,
        name: cam.device_name || cam.location || `Camera ${cam.device_id}`,
        url: cam.image_view,
        area: cam.location || "Baton Rouge",
        latitude: cam.latitude ? parseFloat(cam.latitude) : null,
        longitude: cam.longitude ? parseFloat(cam.longitude) : null,
        city: "Baton Rouge",
        country: "US",
        source: "data.brla.gov",
      }),
    );

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

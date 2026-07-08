import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://api.data.gov.sg/v1/transport/traffic-images";

interface SingaporeCamera {
  camera_id: string;
  image: string;
  location: {
    latitude: number;
    longitude: number;
  };
  timestamp: string;
}

interface SingaporeResponse {
  items: Array<{
    timestamp: string;
    cameras: SingaporeCamera[];
  }>;
}

export async function refreshSingaporeWebcams() {
  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": "tools-service/1.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Singapore webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as SingaporeResponse;
  const cameras = data.items?.[0]?.cameras;
  if (!Array.isArray(cameras) || cameras.length === 0) return;

  const parsedWebcams: WebcamDocument[] = cameras.map(
    (camera: SingaporeCamera): WebcamDocument => ({
      id: `SG-${camera.camera_id}`,
      name: `Camera ${camera.camera_id}`,
      url: camera.image || "",
      area: "Singapore",
      latitude: camera.location?.latitude ?? null,
      longitude: camera.location?.longitude ?? null,
      city: "Singapore",
      country: "SG",
      source: "data.gov.sg",
    }),
  );

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

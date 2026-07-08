import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const SPEED_CAMERAS_URL =
  "https://data.cityofchicago.org/resource/hhkd-rzv4.json";
const RED_LIGHT_CAMERAS_URL =
  "https://data.cityofchicago.org/resource/spqx-js37.json";

interface ChicagoSpeedCamera {
  address?: string;
  intersection?: string;
  first_approach?: string;
  go_live_date?: string;
  latitude?: string | number;
  longitude?: string | number;
}

interface ChicagoRedLightCamera {
  intersection?: string;
  first_approach?: string;
  second_approach?: string;
  third_approach?: string;
  latitude?: string | number;
  longitude?: string | number;
}

export async function refreshChicagoWebcams() {
  const allParsedWebcams: WebcamDocument[] = [];

  const speedResponse = await fetch(`${SPEED_CAMERAS_URL}?$limit=500`, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (speedResponse.ok) {
    const speedData = (await speedResponse.json()) as ChicagoSpeedCamera[];
    if (Array.isArray(speedData)) {
      for (let index = 0; index < speedData.length; index++) {
        const cam = speedData[index];
        allParsedWebcams.push({
          id: `CHI-S-${index}`,
          name: cam.address || cam.intersection || `Speed Camera ${index}`,
          url: "",
          area: cam.first_approach || "Chicago",
          latitude: cam.latitude ? Number(cam.latitude) : null,
          longitude: cam.longitude ? Number(cam.longitude) : null,
          city: "Chicago",
          country: "US",
          source: "data.cityofchicago.org",
        });
      }
    }
  }

  const redLightResponse = await fetch(`${RED_LIGHT_CAMERAS_URL}?$limit=500`, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (redLightResponse.ok) {
    const redLightData =
      (await redLightResponse.json()) as ChicagoRedLightCamera[];
    if (Array.isArray(redLightData)) {
      for (let index = 0; index < redLightData.length; index++) {
        const cam = redLightData[index];
        allParsedWebcams.push({
          id: `CHI-R-${index}`,
          name:
            cam.intersection || `Red Light Camera ${index}`,
          url: "",
          area: cam.first_approach || "Chicago",
          latitude: cam.latitude ? Number(cam.latitude) : null,
          longitude: cam.longitude ? Number(cam.longitude) : null,
          city: "Chicago",
          country: "US",
          source: "data.cityofchicago.org",
        });
      }
    }
  }

  const validWebcams = allParsedWebcams.filter(
    (webcam) => webcam.latitude && webcam.longitude,
  );

  if (validWebcams.length > 0) {
    await upsertWebcams(validWebcams);
  }
}

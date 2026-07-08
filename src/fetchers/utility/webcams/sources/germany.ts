import { buildScraperHeaders } from "../../../../utilities.ts";
import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const AUTOBAHN_API_BASE = "https://verkehr.autobahn.de/o/autobahn";

interface AutobahnCoordinate {
  lat: string;
  long: string;
}

interface AutobahnWebcam {
  identifier: string;
  title: string;
  imageurl?: string;
  linkurl?: string;
  coordinate?: AutobahnCoordinate;
  isBlocked?: string;
}

interface AutobahnRoadsResponse {
  roads: string[];
}

interface AutobahnWebcamResponse {
  webcam: AutobahnWebcam[];
}

export async function refreshGermanyWebcams() {
  const roadsResponse = await fetch(AUTOBAHN_API_BASE, {
    headers: buildScraperHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (!roadsResponse.ok) {
    throw new Error(
      `Failed to fetch Germany Autobahn road list: ${roadsResponse.status}`,
    );
  }

  const roadsData = (await roadsResponse.json()) as AutobahnRoadsResponse;
  if (!roadsData.roads || roadsData.roads.length === 0) return;

  const allParsedWebcams: WebcamDocument[] = [];

  for (const roadIdentifier of roadsData.roads) {
    try {
      const webcamResponse = await fetch(
        `${AUTOBAHN_API_BASE}/${roadIdentifier}/services/webcam`,
        {
          headers: buildScraperHeaders(),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!webcamResponse.ok) continue;

      const webcamData = (await webcamResponse.json()) as AutobahnWebcamResponse;
      if (!webcamData.webcam || webcamData.webcam.length === 0) continue;

      for (const cam of webcamData.webcam) {
        if (cam.isBlocked === "true") continue;

        allParsedWebcams.push({
          id: `DE-${cam.identifier}`,
          name: cam.title || `Autobahn Camera ${cam.identifier}`,
          url: cam.imageurl || cam.linkurl || "",
          area: roadIdentifier,
          latitude: cam.coordinate ? parseFloat(cam.coordinate.lat) : null,
          longitude: cam.coordinate ? parseFloat(cam.coordinate.long) : null,
          city: "Germany",
          country: "DE",
          source: "autobahn.de",
        });
      }
    } catch {
      // Skip individual road failures — continue with remaining roads
    }
  }

  const validWebcams = allParsedWebcams.filter(
    (webcam) => !!(webcam.url || (webcam.latitude && webcam.longitude)),
  );

  if (validWebcams.length > 0) {
    await upsertWebcams(validWebcams);
  }
}

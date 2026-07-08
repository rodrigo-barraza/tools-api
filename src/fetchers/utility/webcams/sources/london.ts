import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const API_URL = "https://api.tfl.gov.uk/Place/Type/JamCam";

interface TfLAdditionalProperty {
  key: string;
  value: string;
}

interface TfLJamCam {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties?: TfLAdditionalProperty[];
}

export async function refreshLondonWebcams() {
  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": "tools-service/1.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch London TfL webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as TfLJamCam[];
  if (!Array.isArray(data) || data.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data
    .map((camera: TfLJamCam): WebcamDocument => {
      const imageUrlProperty = camera.additionalProperties?.find(
        (property: TfLAdditionalProperty) => property.key === "imageUrl",
      );

      return {
        id: `TFL-${camera.id}`,
        name: camera.commonName || `JamCam ${camera.id}`,
        url: imageUrlProperty?.value || "",
        area: "London",
        latitude: camera.lat ?? null,
        longitude: camera.lon ?? null,
        city: "London",
        country: "GB",
        source: "api.tfl.gov.uk",
      };
    })
    .filter(
      (webcam: WebcamDocument) =>
        !!(webcam.url || (webcam.latitude && webcam.longitude)),
    );

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

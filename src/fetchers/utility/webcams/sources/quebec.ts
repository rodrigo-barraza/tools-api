import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const WFS_URL =
  "https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras&outfile=Camera&srsname=EPSG:4326&outputformat=geojson";

interface QuebecCameraProperties {
  id?: string | number;
  nom?: string;
  titre?: string;
  description?: string;
  url_camera?: string;
  url?: string;
  no_route?: string;
  municipalite?: string;
}

interface QuebecFeature {
  type: string;
  properties: QuebecCameraProperties;
  geometry?: {
    type: string;
    coordinates?: [number, number];
  };
}

interface QuebecGeoJSON {
  type: string;
  features: QuebecFeature[];
}

export async function refreshQuebecWebcams() {
  const response = await fetch(WFS_URL, {
    headers: {
      "User-Agent": "tools-service/1.0",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Quebec webcams: ${response.status}`,
    );
  }

  const data = (await response.json()) as QuebecGeoJSON;
  if (!data.features || data.features.length === 0) return;

  const parsedWebcams: WebcamDocument[] = data.features
    .map((feature: QuebecFeature): WebcamDocument => {
      const properties = feature.properties;
      const longitude = feature.geometry?.coordinates?.[0] ?? null;
      const latitude = feature.geometry?.coordinates?.[1] ?? null;

      return {
        id: `QC-${properties.id}`,
        name:
          properties.nom ||
          properties.titre ||
          properties.description ||
          `Camera ${properties.id}`,
        url: properties.url_camera || properties.url || "",
        area:
          properties.municipalite ||
          properties.no_route ||
          "Quebec",
        latitude,
        longitude,
        city: "Quebec",
        country: "CA",
        source: "transports.gouv.qc.ca",
      };
    })
    .filter((webcam: WebcamDocument) => !!(webcam.url || (webcam.latitude && webcam.longitude)));

  if (parsedWebcams.length > 0) {
    await upsertWebcams(parsedWebcams);
  }
}

import {
  upsertWebcams,
  type WebcamDocument,
} from "../../../../models/Webcam.ts";

const CSV_URL =
  "https://catalogue.data.gov.bc.ca/dataset/6b39a910-6c77-476f-ac96-7b4f18849b1c/resource/a9d52d85-8402-4ce7-b2ac-a2779837c48a/download/webcams.csv";

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let characterIndex = 0; characterIndex < line.length; characterIndex++) {
    const character = line[characterIndex];
    if (character === '"') {
      insideQuotes = !insideQuotes;
    } else if (character === "," && !insideQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

export async function refreshBritishColumbiaWebcams() {
  const response = await fetch(CSV_URL, {
    headers: {
      "User-Agent": "tools-service/1.0",
      Accept: "text/csv",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch BC highway webcams CSV: ${response.status}`,
    );
  }

  const csvText = await response.text();
  const lines = csvText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return;

  const headerColumns = parseCSVLine(lines[0]);
  const imageDisplayIndex = headerColumns.indexOf("links_imageDisplay");
  const idIndex = headerColumns.indexOf("id");
  const cameraNameIndex = headerColumns.indexOf("camName");
  const captionIndex = headerColumns.indexOf("caption");
  const latitudeIndex = headerColumns.indexOf("latitude");
  const longitudeIndex = headerColumns.indexOf("longitude");
  const highwayDescriptionIndex = headerColumns.indexOf(
    "highway_locationDescription",
  );

  const parsedWebcams: WebcamDocument[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const columns = parseCSVLine(lines[lineIndex]);
    if (columns.length < headerColumns.length) continue;

    const cameraId = columns[idIndex];
    const cameraName =
      columns[cameraNameIndex] || columns[captionIndex] || `Camera ${cameraId}`;
    const imageUrl = columns[imageDisplayIndex] || "";
    const latitude = parseFloat(columns[latitudeIndex]);
    const longitude = parseFloat(columns[longitudeIndex]);
    const area =
      columns[highwayDescriptionIndex] || "British Columbia";

    parsedWebcams.push({
      id: `BC-${cameraId}`,
      name: cameraName,
      url: imageUrl,
      area,
      latitude: isNaN(latitude) ? null : latitude,
      longitude: isNaN(longitude) ? null : longitude,
      city: "British Columbia",
      country: "CA",
      source: "drivebc.ca",
    });
  }

  const validWebcams = parsedWebcams.filter(
    (webcam) => webcam.url || (webcam.latitude && webcam.longitude),
  );

  if (validWebcams.length > 0) {
    await upsertWebcams(validWebcams);
  }
}

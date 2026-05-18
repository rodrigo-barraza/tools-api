import { buildScraperHeaders } from "../../../../utilities.ts";
import { upsertWebcams } from "../../../../models/Webcam.ts";

export async function refreshCalgaryWebcams() {
  // Open Calgary SODA API (Socrata)
  let allParsedWebcams: any[] = [];
  let offset = 0;
  const limitPerPage = 1000;
  let hasMore = true;

  while (hasMore) {
    const url = `https://data.calgary.ca/resource/k7p9-kppz.json?$limit=${limitPerPage}&$offset=${offset}`;
    const response = await fetch(url, { headers: buildScraperHeaders() });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Calgary webcams (offset: ${offset}): ${response.status}`);
    }
    
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    const parsedWebcams = data.map((cam: any, index: any) => {
      const lat = cam.point?.coordinates ? cam.point.coordinates[1] : null;
      const lon = cam.point?.coordinates ? cam.point.coordinates[0] : null;
      
      return {
        id: `CGY-${offset + index}`, // Reliable unique fallback since camera_url might change
        name: cam.camera_location || cam.camera_url?.description || `Calgary Camera ${offset + index}`,
        url: cam.camera_url?.url || "",
        area: cam.quadrant || "Calgary",
        latitude: lat,
        longitude: lon,
        city: "Calgary",
        country: "CA",
        source: "data.calgary.ca"
      };
    }).filter((c: any) => c.url);

    allParsedWebcams = allParsedWebcams.concat(parsedWebcams);
    
    if (data.length < limitPerPage) {
      hasMore = false;
    } else {
      offset += limitPerPage;
    }
  }

  await upsertWebcams(allParsedWebcams);
}

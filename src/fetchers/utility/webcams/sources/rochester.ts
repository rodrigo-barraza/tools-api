import { fetchNY511Cameras } from "./_ny511_helper.ts";

export async function refreshRochesterWebcams() {
  await fetchNY511Cameras({
    city: "Rochester",
    idPrefix: "ROC",
    bounds: { minLat: 43.05, maxLat: 43.3, minLon: -77.8, maxLon: -77.4 },
  });
}

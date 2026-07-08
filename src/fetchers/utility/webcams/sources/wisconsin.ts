import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshWisconsinWebcams() {
  await fetch511Cameras({
    apiUrl: "https://511wi.gov/api/v2/get/cameras",
    city: "Wisconsin",
    country: "US",
    source: "511wi.gov",
    idPrefix: "WIS",
  });
}

import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshNorthCarolinaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://www.drivenc.gov/api/v2/get/cameras",
    city: "North Carolina",
    country: "US",
    source: "drivenc.gov",
    idPrefix: "NC",
  });
}

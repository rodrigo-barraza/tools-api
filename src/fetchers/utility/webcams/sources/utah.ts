import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshUtahWebcams() {
  await fetch511Cameras({
    apiUrl: "https://www.udottraffic.utah.gov/api/v2/get/cameras",
    city: "Utah",
    country: "US",
    source: "udottraffic.utah.gov",
    idPrefix: "UT",
  });
}

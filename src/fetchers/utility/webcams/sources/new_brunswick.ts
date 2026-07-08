import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshNewBrunswickWebcams() {
  await fetch511Cameras({
    apiUrl: "https://www1.gnb.ca/0113/api/v2/get/cameras",
    city: "New Brunswick",
    country: "CA",
    source: "gnb.ca",
    idPrefix: "NB",
  });
}

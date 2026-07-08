import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshGeorgiaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://511ga.org/api/v2/get/cameras",
    city: "Georgia",
    country: "US",
    source: "511ga.org",
    idPrefix: "GA",
  });
}

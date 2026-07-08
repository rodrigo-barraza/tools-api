import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshLouisianaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://511la.org/api/v2/get/cameras",
    city: "Louisiana",
    country: "US",
    source: "511la.org",
    idPrefix: "LA",
  });
}

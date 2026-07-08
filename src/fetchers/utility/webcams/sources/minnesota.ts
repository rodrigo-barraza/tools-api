import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshMinnesotaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://511mn.org/api/v2/get/cameras",
    city: "Minnesota",
    country: "US",
    source: "511mn.org",
    idPrefix: "MN",
  });
}

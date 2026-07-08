import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshArizonaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://az511.com/api/v2/get/cameras",
    city: "Arizona",
    country: "US",
    source: "az511.com",
    idPrefix: "AZ",
  });
}

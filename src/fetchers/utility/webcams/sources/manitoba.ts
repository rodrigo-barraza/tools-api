import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshManitobaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://www.manitoba511.ca/api/v2/get/cameras",
    city: "Manitoba",
    country: "CA",
    source: "manitoba511.ca",
    idPrefix: "MB",
  });
}

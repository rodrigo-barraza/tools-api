import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshIdahoWebcams() {
  await fetch511Cameras({
    apiUrl: "https://511.idaho.gov/api/v2/get/cameras",
    city: "Idaho",
    country: "US",
    source: "511.idaho.gov",
    idPrefix: "IDH",
  });
}

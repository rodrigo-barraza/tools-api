import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshNevadaWebcams() {
  await fetch511Cameras({
    apiUrl: "https://www.nvroads.com/api/v2/get/cameras",
    city: "Nevada",
    country: "US",
    source: "nvroads.com",
    idPrefix: "NV",
  });
}

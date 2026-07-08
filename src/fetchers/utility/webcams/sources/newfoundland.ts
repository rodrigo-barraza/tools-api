import { fetch511Cameras } from "./_511_helper.ts";

export async function refreshNewfoundlandWebcams() {
  await fetch511Cameras({
    apiUrl: "https://511nl.ca/api/v2/get/cameras",
    city: "Newfoundland",
    country: "CA",
    source: "511nl.ca",
    idPrefix: "NL",
  });
}

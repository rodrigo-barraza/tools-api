import CONFIG from "../../config.js";

const APOD_URL = "https://api.nasa.gov/planetary/apod";

/**
 * Fetch NASA Astronomy Picture of the Day.
 * Uses existing NASA_API_KEY (falls back to DEMO_KEY).
 */
export async function fetchApod() {
  const url = `${APOD_URL}?api_key=${CONFIG.NASA_API_KEY}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`NASA APOD API returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  return {
    title: data.title,
    explanation: data.explanation,
    date: data.date,
    url: data.url,
    hdUrl: data.hdurl || null,
    mediaType: data.media_type,
    copyright: data.copyright || null,
  };
}

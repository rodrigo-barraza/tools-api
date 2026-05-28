import CONFIG from "../../config.ts";

const APOD_URL = "https://api.nasa.gov/planetary/apod";

/**
 * Fetch NASA Astronomy Picture of the Day.
 * Uses existing NASA_API_KEY (falls back to DEMO_KEY).
 */
export async function fetchApod() {
  const url = `${APOD_URL}?api_key=${CONFIG.NASA_API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA APOD API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = await response.json();

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

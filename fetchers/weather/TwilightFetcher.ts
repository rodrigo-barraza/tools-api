import CONFIG from "../../config.js";

const SUNRISE_SUNSET_URL = "https://api.sunrise-sunset.org/json";

/**
 * Fetch detailed twilight times from Sunrise-Sunset.org.
 * Free API, no key required. Provides civil, nautical, and astronomical
 * twilight times plus solar noon and day length.
 */
export async function fetchTwilight() {
  const url = `${SUNRISE_SUNSET_URL}?lat=${CONFIG.LATITUDE}&lng=${CONFIG.LONGITUDE}&formatted=0&tzid=${CONFIG.TIMEZONE}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Sunrise-Sunset API returned ${res.status}: ${res.statusText}`,
    );
  }

  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(`Sunrise-Sunset API returned status: ${data.status}`);
  }

  const r = data.results;

  return {
    sunrise: r.sunrise,
    sunset: r.sunset,
    solarNoon: r.solar_noon,
    dayLength: r.day_length,
    civilTwilightBegin: r.civil_twilight_begin,
    civilTwilightEnd: r.civil_twilight_end,
    nauticalTwilightBegin: r.nautical_twilight_begin,
    nauticalTwilightEnd: r.nautical_twilight_end,
    astronomicalTwilightBegin: r.astronomical_twilight_begin,
    astronomicalTwilightEnd: r.astronomical_twilight_end,
  };
}

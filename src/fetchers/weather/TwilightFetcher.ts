import CONFIG from "../../config.ts";

const SUNRISE_SUNSET_URL = "https://api.sunrise-sunset.org/json";

/**
 * Fetch detailed twilight times from Sunrise-Sunset.org.
 * Free API, no key required. Provides civil, nautical, and astronomical
 * twilight times plus solar noon and day length.
 */
export async function fetchTwilight() {
  const url = `${SUNRISE_SUNSET_URL}?lat=${CONFIG.LATITUDE}&lng=${CONFIG.LONGITUDE}&formatted=0&tzid=${CONFIG.TIMEZONE}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Sunrise-Sunset API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (data.status !== "OK") {
    throw new Error(`Sunrise-Sunset API returned status: ${data.status}`);
  }

  const results = data.results;

  return {
    sunrise: results.sunrise,
    sunset: results.sunset,
    solarNoon: results.solar_noon,
    dayLength: results.day_length,
    civilTwilightBegin: results.civil_twilight_begin,
    civilTwilightEnd: results.civil_twilight_end,
    nauticalTwilightBegin: results.nautical_twilight_begin,
    nauticalTwilightEnd: results.nautical_twilight_end,
    astronomicalTwilightBegin: results.astronomical_twilight_begin,
    astronomicalTwilightEnd: results.astronomical_twilight_end,
  };
}

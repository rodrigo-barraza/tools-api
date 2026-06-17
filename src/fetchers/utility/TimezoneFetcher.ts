import { TIMEZONE_BASE_URL } from "../../constants.ts";

/**
 * World Time API fetcher.
 * https://worldtimeapi.org/ — no auth, fully open.
 * Returns current time in any timezone, with offset, DST info, and abbreviation.
 */

// ─── Get Time in Timezone ──────────────────────────────────────────

/**
 * Get current time in a specific timezone.


 */
export async function getTimeInTimezone(timezone: string) {
  const url = `${TIMEZONE_BASE_URL}/timezone/${encodeURIComponent(timezone)}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, timezone, message: "Timezone not found" };
  }
  if (!response.ok) {
    throw new Error(
      `World Time API → ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  return {
    found: true,
    timezone: data.timezone,
    datetime: data.datetime,
    abbreviation: data.abbreviation,
    utcOffset: data.utc_offset,
    utcDatetime: data.utc_datetime,
    dayOfWeek: data.day_of_week,
    dayOfYear: data.day_of_year,
    weekNumber: data.week_number,
    isDaylightSavingTime: data['dst'],
    daylightSavingTimeFrom: data['dst_from'] || null,
    daylightSavingTimeUntil: data['dst_until'] || null,
    daylightSavingTimeOffset: data['dst_offset'] || 0,
  };
}

// ─── List Timezones ────────────────────────────────────────────────

/**
 * Get all available IANA timezone identifiers.


 */
export async function listTimezones(area?: string) {
  const path = area ? `/timezone/${encodeURIComponent(area)}` : "/timezone";
  const url = `${TIMEZONE_BASE_URL}${path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `World Time API → ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

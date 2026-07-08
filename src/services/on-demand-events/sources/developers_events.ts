import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";

const DEVELOPERS_EVENTS_URL = "https://developers.events/all-events.json";

interface DevelopersEvent {
  name: string;
  date: number[];
  hyperlink: string;
  location: string;
  city: string;
  country: string;
  status: string;
}

/**
 * Fetch developer conferences from developers.events. No API key required.
 * Returns a massive JSON array (5,000+ events) — filtered client-side by city/country.
 */
export async function fetchDeveloperConferencesOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  const response = await fetch(DEVELOPERS_EVENTS_URL);
  if (!response.ok) return [];

  const allConferences: DevelopersEvent[] = await response.json();
  const normalizedCity = options.city.toLowerCase();
  const normalizedCountry = options.countryCode.toUpperCase();
  const now = Date.now();
  const cutoffTimestamp = now + options.days * 24 * 60 * 60 * 1000;

  return allConferences
    .filter((conference) => {
      // Must have dates and at least one is in the future within our window
      if (!conference.date || conference.date.length === 0) return false;
      const startTimestamp = conference.date[0];
      if (startTimestamp < now || startTimestamp > cutoffTimestamp) return false;

      // Match by city or country
      const conferenceCity = (conference.city || "").toLowerCase();
      const conferenceCountry = (conference.country || "").toUpperCase();

      return (
        conferenceCity.includes(normalizedCity) ||
        normalizedCity.includes(conferenceCity) ||
        conferenceCountry === normalizedCountry
      );
    })
    .slice(0, 50)
    .map((conference) => {
      const startDate = new Date(conference.date[0]);
      const endDate =
        conference.date.length > 1
          ? new Date(conference.date[conference.date.length - 1])
          : undefined;

      return {
        name: conference.name,
        source: "developer-events",
        sourceId: `devconf-${conference.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${startDate.toISOString().slice(0, 10)}`,
        category: "conference",
        startDate,
        endDate,
        url: conference.hyperlink,
        location: conference.location,
        city: conference.city,
        country: conference.country,
      };
    });
}

import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";

const NAGER_BASE = "https://date.nager.at/api/v3";

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  types: string[];
}

/**
 * Fetch upcoming public holidays from Nager.Date. No API key required.
 * Supports 166 countries via ISO 3166-1 alpha-2 country codes.
 */
export async function fetchNagerHolidaysOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  const countryCode = options.countryCode.toUpperCase();

  const response = await fetch(
    `${NAGER_BASE}/NextPublicHolidays/${countryCode}`,
  );
  if (!response.ok) return [];

  const holidays: NagerHoliday[] = await response.json();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + options.days);

  return holidays
    .filter((holiday) => new Date(holiday.date) <= cutoffDate)
    .map((holiday) => ({
      name: holiday.localName !== holiday.name
        ? `${holiday.name} (${holiday.localName})`
        : holiday.name,
      source: "nager-holidays",
      sourceId: `nager-${countryCode}-${holiday.date}`,
      category: "holiday",
      startDate: new Date(holiday.date),
      countryCode: holiday.countryCode,
      isNational: holiday.global,
      holidayType: holiday.types.join(", "),
    }));
}

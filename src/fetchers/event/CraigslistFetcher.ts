import * as cheerio from "cheerio";
import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.ts";
import type { CachedEvent } from "../../caches/EventCache.ts";

const BASE_URL = "https://vancouver.craigslist.org/search/eee";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Parse a Craigslist date string into a Date object.
 * Craigslist uses formats like "Mar 20" or "2026-03-20 10:00"
 */
function parseDate(dateString: string | null): Date | undefined {
  if (!dateString) return undefined;
  const parsedDate = new Date(dateString);
  return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

/**
 * Fetch events from Craigslist Vancouver community events section.
 * Scrapes HTML with cheerio since Craigslist has no public API.
 */
export async function fetchCraigslistEvents(): Promise<CachedEvent[]> {
  const response = await fetch(BASE_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`Craigslist returned ${response.status}`);
  }

  const html = await response.text();
  const CHEERIOAPI = cheerio.load(html);
  const events: CachedEvent[] = [];

  CHEERIOAPI(".cl-static-search-result").each((_index, rawElement) => {
    const element = CHEERIOAPI(rawElement);
    const title = element.find(".title").text().trim();
    const link = element.attr("href");
    const dateString = element.find(".date").text().trim();
    const price = element.find(".price").text().trim();
    const location = element.find(".location").text().trim();

    if (!title) return;

    const fullUrl = link?.startsWith("http")
      ? link
      : `https://vancouver.craigslist.org${link}`;

    events.push({
      sourceId: fullUrl || `craigslist-${Date.now()}-${_index}`,
      source: EVENT_SOURCES.CRAIGSLIST,
      name: title,
      description: undefined,
      url: fullUrl,
      imageUrl: undefined,
      startDate: parseDate(dateString),
      endDate: undefined,
      venue: {
        name: location || undefined,
        address: undefined,
        city: "Vancouver",
        state: "BC",
        country: "CA",
        latitude: undefined,
        longitude: undefined,
      },
      category: EVENT_CATEGORIES.OTHER,
      genres: ["community"],
      priceRange: price
        ? {
            min: parseFloat(price.replace(/[^0-9.]/g, "")) || 0,
            max: undefined,
            currency: "CAD",
          }
        : undefined,
      status: "onsale",
      fetchedAt: new Date(),
    });
  });

  // Fallback: try the gallery/list results format
  if (events.length === 0) {
    CHEERIOAPI("li.cl-search-result, .result-row").each((_index, rawElement) => {
      const element = CHEERIOAPI(rawElement);
      const linkElement = element.find("a.posting-title, a.result-title, a");
      const title = linkElement.text().trim();
      const href = linkElement.attr("href");
      const dateString =
        element.find("time").attr("datetime") || element.find(".date").text().trim();

      if (!title) return;

      const fullUrl = href?.startsWith("http")
        ? href
        : `https://vancouver.craigslist.org${href}`;

      events.push({
        sourceId: fullUrl || `craigslist-${Date.now()}-${_index}`,
        source: EVENT_SOURCES.CRAIGSLIST,
        name: title,
        description: undefined,
        url: fullUrl,
        imageUrl: undefined,
        startDate: parseDate(dateString),
        endDate: undefined,
        venue: {
          name: undefined,
          address: undefined,
          city: "Vancouver",
          state: "BC",
          country: "CA",
          latitude: undefined,
          longitude: undefined,
        },
        category: EVENT_CATEGORIES.OTHER,
        genres: ["community"],
        priceRange: undefined,
        status: "onsale",
        fetchedAt: new Date(),
      });
    });
  }

  return events;
}

import * as cheerio from "cheerio";
import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.js";

const EVENTS_URL = "https://vancouver.ca/news-calendar/upcoming-events.aspx";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

/**
 * Fetch events from the City of Vancouver events page.
 * Scrapes HTML with cheerio.
 */
export async function fetchCityOfVancouverEvents() {
  const response = await fetch(EVENTS_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(
      `City of Vancouver events page returned ${response.status}`,
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const events = [];

  // Try multiple selectors — city websites change layouts
  const selectors = [
    ".event-listing, .views-row, article",
    ".event-card, .card",
    "li[class*='event']",
    ".field-content",
  ];

  for (const selector of selectors) {
    if (events.length > 0) break;

    $(selector).each((_i, el) => {
      const $el = $(el);
      const $link = $el.find("a").first();
      const title =
        $el
          .find("h2, h3, h4, .event-title, .field-content a")
          .first()
          .text()
          .trim() || $link.text().trim();
      const href = $link.attr("href");
      const dateText = $el
        .find("time, .date, .event-date, [class*='date']")
        .first()
        .text()
        .trim();
      const location = $el
        .find(".location, .venue, [class*='location']")
        .first()
        .text()
        .trim();
      const description = $el
        .find("p, .description, .summary, .teaser")
        .first()
        .text()
        .trim();
      const imageUrl = $el.find("img").first().attr("src") || null;

      if (!title || title.length < 3) return;

      const fullUrl = href
        ? href.startsWith("http")
          ? href
          : `https://vancouver.ca${href}`
        : null;

      const startDate = dateText ? new Date(dateText) : null;

      events.push({
        sourceId: fullUrl || `cov-${Date.now()}-${_i}`,
        source: EVENT_SOURCES.CITY_OF_VANCOUVER,
        name: title,
        description: description || null,
        url: fullUrl,
        imageUrl: imageUrl?.startsWith("http")
          ? imageUrl
          : imageUrl
            ? `https://vancouver.ca${imageUrl}`
            : null,
        startDate: startDate && !isNaN(startDate.getTime()) ? startDate : null,
        endDate: null,
        venue: {
          name: location || null,
          address: null,
          city: "Vancouver",
          state: "BC",
          country: "CA",
          latitude: null,
          longitude: null,
        },
        category: EVENT_CATEGORIES.OTHER,
        genres: ["community", "city"],
        priceRange: null,
        status: "onsale",
        fetchedAt: new Date(),
      });
    });
  }

  return events;
}

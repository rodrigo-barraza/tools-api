import * as cheerio from "cheerio";
import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.js";

const UBC_EVENTS_URL = "https://events.ubc.ca/";
const SFU_EVENTS_URL = "https://www.sfu.ca/sfunews/events.html";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

/**
 * Fetch and parse UBC events from events.ubc.ca.
 */
async function fetchUbcEvents() {
  const response = await fetch(UBC_EVENTS_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`UBC events page returned ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const events = [];

  $("article, .event-card, .views-row, [class*='event'], .card").each(
    (_i, el) => {
      const $el = $(el);
      const $link = $el.find("a").first();
      const title =
        $el.find("h2, h3, .event-title, .card-title").first().text().trim() ||
        $link.text().trim();
      const href = $link.attr("href");
      const dateText = $el
        .find("time, .event-date, .date, [class*='date']")
        .first()
        .text()
        .trim();
      const description = $el
        .find("p, .event-description, .summary, .card-text")
        .first()
        .text()
        .trim();
      const imageUrl = $el.find("img").first().attr("src") || null;

      if (!title || title.length < 3) return;

      const fullUrl = href
        ? href.startsWith("http")
          ? href
          : `https://events.ubc.ca${href}`
        : null;

      const startDate = dateText ? new Date(dateText) : null;

      events.push({
        sourceId: fullUrl || `ubc-${Date.now()}-${_i}`,
        source: EVENT_SOURCES.UBC,
        name: title,
        description: description || null,
        url: fullUrl,
        imageUrl: imageUrl?.startsWith("http")
          ? imageUrl
          : imageUrl
            ? `https://events.ubc.ca${imageUrl}`
            : null,
        startDate: startDate && !isNaN(startDate.getTime()) ? startDate : null,
        endDate: null,
        venue: {
          name: "University of British Columbia",
          address: null,
          city: "Vancouver",
          state: "BC",
          country: "CA",
          latitude: 49.2606,
          longitude: -123.246,
        },
        category: EVENT_CATEGORIES.OTHER,
        genres: ["university", "education"],
        priceRange: null,
        status: "onsale",
        fetchedAt: new Date(),
      });
    },
  );

  return events;
}

/**
 * Fetch and parse SFU events from sfu.ca.
 */
async function fetchSfuEvents() {
  const response = await fetch(SFU_EVENTS_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`SFU events page returned ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const events = [];

  $("article, .event-card, .views-row, [class*='event'], .card, li").each(
    (_i, el) => {
      const $el = $(el);
      const $link = $el.find("a").first();
      const title =
        $el.find("h2, h3, h4, .event-title").first().text().trim() ||
        $link.text().trim();
      const href = $link.attr("href");
      const dateText = $el
        .find("time, .event-date, .date, [class*='date']")
        .first()
        .text()
        .trim();
      const description = $el
        .find("p, .event-description, .summary")
        .first()
        .text()
        .trim();

      if (!title || title.length < 5) return;

      const fullUrl = href
        ? href.startsWith("http")
          ? href
          : `https://www.sfu.ca${href}`
        : null;

      const startDate = dateText ? new Date(dateText) : null;

      events.push({
        sourceId: fullUrl || `sfu-${Date.now()}-${_i}`,
        source: EVENT_SOURCES.SFU,
        name: title,
        description: description || null,
        url: fullUrl,
        imageUrl: null,
        startDate: startDate && !isNaN(startDate.getTime()) ? startDate : null,
        endDate: null,
        venue: {
          name: "Simon Fraser University",
          address: null,
          city: "Burnaby",
          state: "BC",
          country: "CA",
          latitude: 49.2781,
          longitude: -122.9199,
        },
        category: EVENT_CATEGORIES.OTHER,
        genres: ["university", "education"],
        priceRange: null,
        status: "onsale",
        fetchedAt: new Date(),
      });
    },
  );

  return events;
}

/**
 * Fetch events from both UBC and SFU.
 */
export async function fetchUniversityEvents() {
  const results = await Promise.allSettled([
    fetchUbcEvents(),
    fetchSfuEvents(),
  ]);

  const events = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      console.warn(
        `[University] ⚠️ Partial failure: ${result.reason?.message}`,
      );
    }
  }

  return events;
}

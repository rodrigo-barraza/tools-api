import * as cheerio from "cheerio";
import { EVENT_SOURCES, EVENT_CATEGORIES } from "../../constants.ts";
import logger from "../../logger.ts";
import type { CachedEvent } from "../../caches/EventCache.ts";

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
async function fetchUbcEvents(): Promise<CachedEvent[]> {
  const response = await fetch(UBC_EVENTS_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`UBC events page returned ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const events: CachedEvent[] = [];

  $("article, .event-card, .views-row, [class*='event'], .card").each(
    (_i, element) => {
      const $element = $(element);
      const $link = $element.find("a").first();
      const title =
        $element
          .find("h2, h3, .event-title, .card-title")
          .first()
          .text()
          .trim() || $link.text().trim();
      const href = $link.attr("href");
      const dateText = $element
        .find("time, .event-date, .date, [class*='date']")
        .first()
        .text()
        .trim();
      const description = $element
        .find("p, .event-description, .summary, .card-text")
        .first()
        .text()
        .trim();
      const imageUrl = $element.find("img").first().attr("src") || undefined;

      if (!title || title.length < 3) return;

      const fullUrl = href
        ? href.startsWith("http")
          ? href
          : `https://events.ubc.ca${href}`
        : undefined;

      const startDate = dateText ? new Date(dateText) : undefined;

      events.push({
        sourceId: fullUrl || `ubc-${Date.now()}-${_i}`,
        source: EVENT_SOURCES.UBC,
        name: title,
        description: description || undefined,
        url: fullUrl,
        imageUrl: imageUrl?.startsWith("http")
          ? imageUrl
          : imageUrl
            ? `https://events.ubc.ca${imageUrl}`
            : undefined,
        startDate:
          startDate && !isNaN(startDate.getTime()) ? startDate : undefined,
        endDate: undefined,
        venue: {
          name: "University of British Columbia",
          address: undefined,
          city: "Vancouver",
          state: "BC",
          country: "CA",
          latitude: 49.2606,
          longitude: -123.246,
        },
        category: EVENT_CATEGORIES.OTHER,
        genres: ["university", "education"],
        priceRange: undefined,
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
async function fetchSfuEvents(): Promise<CachedEvent[]> {
  const response = await fetch(SFU_EVENTS_URL, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`SFU events page returned ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const events: CachedEvent[] = [];

  $("article, .event-card, .views-row, [class*='event'], .card, li").each(
    (_i, element) => {
      const $element = $(element);
      const $link = $element.find("a").first();
      const title =
        $element.find("h2, h3, h4, .event-title").first().text().trim() ||
        $link.text().trim();
      const href = $link.attr("href");
      const dateText = $element
        .find("time, .event-date, .date, [class*='date']")
        .first()
        .text()
        .trim();
      const description = $element
        .find("p, .event-description, .summary")
        .first()
        .text()
        .trim();

      if (!title || title.length < 5) return;

      const fullUrl = href
        ? href.startsWith("http")
          ? href
          : `https://www.sfu.ca${href}`
        : undefined;

      const startDate = dateText ? new Date(dateText) : undefined;

      events.push({
        sourceId: fullUrl || `sfu-${Date.now()}-${_i}`,
        source: EVENT_SOURCES.SFU,
        name: title,
        description: description || undefined,
        url: fullUrl,
        imageUrl: undefined,
        startDate:
          startDate && !isNaN(startDate.getTime()) ? startDate : undefined,
        endDate: undefined,
        venue: {
          name: "Simon Fraser University",
          address: undefined,
          city: "Burnaby",
          state: "BC",
          country: "CA",
          latitude: 49.2781,
          longitude: -122.9199,
        },
        category: EVENT_CATEGORIES.OTHER,
        genres: ["university", "education"],
        priceRange: undefined,
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
export async function fetchUniversityEvents(): Promise<CachedEvent[]> {
  const results = await Promise.allSettled([
    fetchUbcEvents(),
    fetchSfuEvents(),
  ]);

  const events: CachedEvent[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      logger.warn(`[University] ⚠️ Partial failure: ${result.reason?.message}`);
    }
  }

  return events;
}

import CONFIG from "./config.js";
import { USER_AGENTS } from "./constants.js";

// ─── Shared Utilities ──────────────────────────────────────────────

/**
 * Async sleep for rate-limiting.
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pick a random user-agent string.
 */
export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Safely parse a price string like "$29.99" or "29.99" into a number.
 */
export function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = String(priceStr).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Text Utilities ────────────────────────────────────────────────

/**
 * Normalize a name/title for deduplication and matching.
 * Strips non-alphanumeric chars, lowercases, collapses whitespace.
 * @param {string} str
 * @returns {string}
 */
export function normalizeName(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Strip HTML tags from a string and decode common HTML entities.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── XML Utilities ─────────────────────────────────────────────────

/**
 * Extract the text content of an XML tag (supports CDATA, namespaced tags).
 * @param {string} xml - XML string to search
 * @param {string} tag - Tag name (e.g. "title", "ht:approx_traffic")
 * @returns {string|null} Tag content or null
 */
export function extractXmlTag(xml, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<${escapedTag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escapedTag}>|<${escapedTag}>([\\s\\S]*?)<\\/${escapedTag}>`,
  );
  const match = xml.match(regex);
  if (!match) return null;
  return (match[1] || match[2] || "").trim();
}

/**
 * Extract all occurrences of an XML element from a string.
 * @param {string} xml - Full XML body
 * @param {string} tag - Element tag name (e.g. "item")
 * @returns {string[]} Array of raw element blocks
 */
export function extractXmlItems(xml, tag) {
  const items = [];
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  let cursor = 0;

  while (true) {
    const start = xml.indexOf(openTag, cursor);
    if (start === -1) break;
    const end = xml.indexOf(closeTag, start);
    if (end === -1) break;
    items.push(xml.slice(start, end + closeTag.length));
    cursor = end + closeTag.length;
  }

  return items;
}

// ─── Array Utilities ───────────────────────────────────────────────

/**
 * Batch an array into chunks of a given size.
 * @param {Array} array
 * @param {number} size
 * @returns {Array[]}
 */
export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ─── Route Utilities ───────────────────────────────────────────────

/**
 * Parse an integer query param with a default fallback.
 * @param {string|undefined} value - Raw query string value
 * @param {number} defaultValue
 * @returns {number}
 */
export function parseIntParam(value, defaultValue) {
  if (value == null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ─── Scraping Utilities ────────────────────────────────────────────

/**
 * Build browser-like headers for web scraping requests.
 * @param {string} [referer] - Optional Referer header
 * @returns {object}
 */
export function buildScraperHeaders(referer) {
  const headers = {
    "User-Agent": randomUserAgent(),
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    DNT: "1",
  };
  if (referer) headers.Referer = referer;
  return headers;
}

// ─── OAuth Token Manager ───────────────────────────────────────────

/**
 * Reusable OAuth2 client-credentials token manager with caching.
 * Handles token expiry and automatic refresh.
 */
export class TokenManager {
  #token = null;
  #expiry = 0;
  #fetchFn;

  /**
   * @param {Function} fetchFn - Async function that returns { token, expiresInMs }
   */
  constructor(fetchFn) {
    this.#fetchFn = fetchFn;
  }

  /**
   * Get a valid token, refreshing if expired.
   * @returns {Promise<string>}
   */
  async getToken() {
    if (this.#token && Date.now() < this.#expiry) return this.#token;
    const { token, expiresInMs } = await this.#fetchFn();
    this.#token = token;
    this.#expiry = Date.now() + expiresInMs;
    return this.#token;
  }

  /** Invalidate the cached token (e.g. on 401). */
  invalidate() {
    this.#token = null;
    this.#expiry = 0;
  }
}

// ─── Event Utilities ───────────────────────────────────────────────

/**
 * Build a Google Static Maps API URL for a given lat/lng.
 */
export function buildStaticMapUrl(
  latitude,
  longitude,
  {
    zoom = 14,
    size = "400x300",
    maptype = "roadmap",
    markerColor = "red",
  } = {},
) {
  if (!CONFIG.GOOGLE_PLACES_API_KEY || !latitude || !longitude) return null;

  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: zoom.toString(),
    size,
    maptype,
    markers: `color:${markerColor}|${latitude},${longitude}`,
    key: CONFIG.GOOGLE_PLACES_API_KEY,
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

/**
 * Enrich an event with a static map URL if it has coordinates.
 */
export function enrichEventWithMapUrl(event) {
  if (!event?.venue?.latitude || !event?.venue?.longitude) return event;

  event.mapImageUrl = buildStaticMapUrl(
    event.venue.latitude,
    event.venue.longitude,
  );

  return event;
}

// ─── Product Utilities ─────────────────────────────────────────────

/**
 * Map a source-specific category string to a unified category.
 */
export function normalizeCategory(sourceCategory, categoryMappings) {
  if (!sourceCategory) return "other";
  const lower = sourceCategory.toLowerCase();
  const match = categoryMappings.find(
    (m) =>
      m.name.toLowerCase() === lower ||
      m.slug?.toLowerCase() === lower ||
      m.id?.toLowerCase() === lower,
  );
  return match?.unified || "other";
}

/**
 * Compute a composite trending score for cross-source ranking.
 */
export function computeTrendingScore(product) {
  const rankScore = product.rank ? Math.max(0, 100 - product.rank) : 50;
  const ratingScore = (product.rating || 0) * 4;
  const reviewScore = product.reviewCount
    ? Math.min(20, Math.log10(product.reviewCount + 1) * 5)
    : 0;
  const ageHours = product.fetchedAt
    ? (Date.now() - new Date(product.fetchedAt).getTime()) / 3_600_000
    : 24;
  const recencyScore = Math.max(0, 10 - ageHours * 0.5);

  return (
    Math.round((rankScore + ratingScore + reviewScore + recencyScore) * 10) / 10
  );
}

import type { Request, Response } from "express";
import CONFIG from "./config.ts";
import crypto from "node:crypto";
import logger from "./logger.ts";
import {
  USER_AGENTS,
  EPHEMERAL_TTL_MS,
  EPHEMERAL_MAX_SIZE,
} from "./constants.ts";

// ─── Shared Utilities ──────────────────────────────────────────────

/**
 * Pick a random user-agent string.
 */
export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Re-exported from the canonical utilities-library so all 78+ import sites
 * across tools-service get the single-source-of-truth version.
 */
import { errorMessage } from "@rodrigo-barraza/utilities-library";
export { errorMessage };

// ─── XML Utilities ─────────────────────────────────────────────────

/**
 * Extract the text content of an XML tag (supports CDATA, namespaced tags).
 */
export function extractXmlTag(xml: string, tag: string): string | null {
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
 */
export function extractXmlItems(xml: string, tag: string): string[] {
  const items: string[] = [];
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

// ─── Scraping Utilities ────────────────────────────────────────────

/**
 * Build browser-like headers for web scraping requests.
 */
export function buildScraperHeaders(referer?: string): Record<string, string> {
  const headers: Record<string, string> = {
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

// ─── Event Utilities ───────────────────────────────────────────────

interface StaticMapOptions {
  zoom?: number;
  size?: string;
  maptype?: string;
  markerColor?: string;
}

interface EventWithVenue {
  venue?: { latitude?: number; longitude?: number };
  mapImageUrl?: string | null;
  [key: string]: unknown;
}

/**
 * Build a Google Static Maps API URL for a given lat/lng.
 */
export function buildStaticMapUrl(
  latitude: number,
  longitude: number,
  {
    zoom = 14,
    size = "400x300",
    maptype = "roadmap",
    markerColor = "red",
  }: StaticMapOptions = {},
): string | null {
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
export function enrichEventWithMapUrl(event: EventWithVenue): EventWithVenue {
  if (!event?.venue?.latitude || !event?.venue?.longitude) return event;

  event.mapImageUrl = buildStaticMapUrl(
    event.venue.latitude,
    event.venue.longitude,
  );

  return event;
}

// ─── Product Utilities ─────────────────────────────────────────────

interface CategoryMapping {
  name: string;
  slug?: string;
  id?: string;
  unified?: string;
}

interface ProductForScoring {
  rank?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  fetchedAt?: string | Date | null;
}

/**
 * Map a source-specific category string to a unified category.
 */
export function normalizeCategory(
  sourceCategory: string | undefined,
  categoryMappings: CategoryMapping[],
): string {
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
export function computeTrendingScore(product: ProductForScoring): number {
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

// ─── Agentic Route Handler ────────────────────────────────────

/**
 * Wrap an agentic service call with standard error-status mapping.
 * Agentic services return `{ error }` objects (not throw). This wrapper
 * maps "outside allowed"/"blocked" errors to 403, other errors to 400,
 * and sends the result as JSON on success.
 */
export function agenticHandler<T extends object>(
  fn: (req: Request) => Promise<T>,
) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req);
      const errorValue = (result as Record<string, unknown>).error;
      if (typeof errorValue === "string") {
        const isForbidden =
          errorValue.includes("outside allowed") ||
          errorValue.includes("blocked");
        return res.status(isForbidden ? 403 : 400).json(result);
      }
      res.json(result);
    } catch (error: unknown) {
      logger.error(`Agentic handler error: ${errorMessage(error)}`);
      res.status(500).json({ error: "Internal agentic tool error" });
    }
  };
}

// ─── Ephemeral Store ──────────────────────────────────────────

interface EphemeralEntry<T> {
  value: T;
  createdAt: number;
}

/**
 * Generic in-memory ephemeral store backed by a Map with automatic
 * TTL expiry and lazy cleanup. Replaces the duplicated
 * Map + TTL + cleanup pattern used across CSV, QR, LaTeX, Diagram,
 * Map, and Chart stores.
 */
export class EphemeralStore<T = unknown> {
  #map = new Map<string, EphemeralEntry<T>>();
  #ttlMs: number;
  #maxSize: number;

  constructor(
    ttlMs: number = EPHEMERAL_TTL_MS,
    maxSize: number = EPHEMERAL_MAX_SIZE,
  ) {
    this.#ttlMs = ttlMs;
    this.#maxSize = maxSize;
  }

  /**
   * Store a value and return its generated ID.
   */
  set(value: T): string {
    const id = crypto.randomUUID().slice(0, 12);
    this.#map.set(id, { value, createdAt: Date.now() });
    this.#cleanup();
    return id;
  }

  /**
   * Retrieve a stored value by ID. Returns null if expired or not found.
   */
  get(id: string): T | null {
    const entry = this.#map.get(id);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.#ttlMs) {
      this.#map.delete(id);
      return null;
    }
    return entry.value;
  }

  /** Lazy cleanup — only runs when size exceeds the threshold. */
  #cleanup() {
    if (this.#map.size <= this.#maxSize) return;
    const now = Date.now();
    for (const [k, v] of this.#map) {
      if (now - v.createdAt > this.#ttlMs) this.#map.delete(k);
    }
  }
}

// ─── Local URL Builder ────────────────────────────────────────

/**
 * Build a full local URL for this server (embed/download endpoints).
 * Uses TOOLS_SERVICE_URL from vault when available, falling back to localhost.
 */
export function buildLocalUrl(
  routePath: string,
  params?: Record<string, string>,
): string {
  const selfBaseUrl = CONFIG.TOOLS_SERVICE_URL;
  const base = `${selfBaseUrl}/${routePath}`;
  if (!params || Object.keys(params).length === 0) return base;
  const queryString = new URLSearchParams(params).toString();
  return `${base}?${queryString}`;
}

// ─── HTML Embed Shell ─────────────────────────────────────────

interface EmbedHtmlOptions {
  headExtra?: string;
  styles: string;
  bodyContent: string;
  scripts: string;
}

/**
 * Build a standard HTML embed page shell. Used by LaTeX, Mermaid,
 * and future embed renderers to avoid duplicating the HTML boilerplate.
 */
export function buildEmbedHtml({
  headExtra = "",
  styles,
  bodyContent,
  scripts,
}: EmbedHtmlOptions): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${headExtra}<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    background:#0f172a;
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:100vh;
    padding:24px;
  }
${styles}
</style>
</head><body>
${bodyContent}
${scripts}
<script>
  // Report rendered content dimensions to parent for iframe auto-resize
  function reportSize() {
    var element = document.body;
    var contentWidth = element.scrollWidth;
    var contentHeight = element.scrollHeight;
    if (contentWidth && contentHeight) {
      window.parent.postMessage({ type: "embed-resize", width: contentWidth, height: contentHeight }, "*");
    }
  }
  // Report after initial render, fonts, and any async rendering (KaTeX, Mermaid)
  requestAnimationFrame(function() { setTimeout(reportSize, 200); });
  window.addEventListener("load", function() { setTimeout(reportSize, 300); });
</${"script"}>
</body></html>`;
}

// ─── Caller Context Extraction ────────────────────────────────

interface CallerContext {
  project: string;
  username: string;
  agent: string | null;
  traceId: string | null;
  agentSessionId: string | null;
}

/**
 * Extract caller identity context from request headers.
 * Replaces the duplicated 5-line header extraction block in
 * CreativeRoutes (4 occurrences) and AgenticRoutes.
 */
export function extractCallerContext(req: Request): CallerContext {
  return {
    project: (req.headers["x-project"] as string) || "tools-api",
    username: (req.headers["x-username"] as string) || "system",
    agent: (req.headers["x-agent"] as string) || null,
    traceId: (req.headers["x-trace-id"] as string) || null,
    agentSessionId: (req.headers["x-agent-session-id"] as string) || null,
  };
}

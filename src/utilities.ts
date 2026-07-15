import type { Request, Response } from "express";
import CONFIG from "./config.ts";
import crypto from "node:crypto";
import logger from "./logger.ts";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  USER_AGENTS,
  EPHEMERAL_TTL_MS,
  EPHEMERAL_MAX_SIZE,
  AGENTIC_HANDLER_TIMEOUT_MS,
  AGENTIC_RESULT_SIZE_WARN_BYTES,
} from "./constants.ts";

// ─── Shared Utilities ──────────────────────────────────────────────

// ─── Bash Binary Resolution ───────────────────────────────────────
// Resolves the absolute path to bash once at module load time.
// Prevents `spawn bash ENOENT` in containerized/sandboxed environments
// where PATH may not include the bash binary's directory.

const BASH_SEARCH_PATHS = [
  "/bin/bash",
  "/usr/bin/bash",
  "/usr/local/bin/bash",
];

function resolveBashBinaryPath(): string {
  // 1. Check well-known absolute paths first (instant, no subprocess)
  for (const candidatePath of BASH_SEARCH_PATHS) {
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  // 2. Fall back to `which bash` for non-standard installations
  try {
    const whichResult = execSync("which bash", { encoding: "utf-8" }).trim();
    if (whichResult && existsSync(whichResult)) {
      return whichResult;
    }
  } catch {
    // `which` itself may not exist — continue to fallback
  }

  // 3. Last resort: return unqualified "bash" and let PATH resolve it at spawn time.
  // This preserves existing behavior for environments where bash IS on PATH.
  logger.warn(
    "[utilities] Could not resolve absolute bash path — falling back to unqualified 'bash'. " +
    `Searched: ${BASH_SEARCH_PATHS.join(", ")}`,
  );
  return "bash";
}

/**
 * Absolute path to the bash binary, resolved once at startup.
 * Use this instead of the bare string "bash" in spawn() calls to
 * prevent ENOENT errors in environments with incomplete PATH.
 */
export const RESOLVED_BASH_PATH = resolveBashBinaryPath();

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
import { IDENTITY_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";
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
  if (!CONFIG.GOOGLE_CLOUD_API_KEY || !latitude || !longitude) return null;

  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: zoom.toString(),
    size,
    maptype,
    markers: `color:${markerColor}|${latitude},${longitude}`,
    key: CONFIG.GOOGLE_CLOUD_API_KEY,
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
    (mapping) =>
      mapping.name.toLowerCase() === lower ||
      mapping.slug?.toLowerCase() === lower ||
      mapping.id?.toLowerCase() === lower,
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
 * Machine-readable error classification, additive to the `error` string.
 * The calling agentic loop (and the model) can branch on `code` and
 * `retryable` instead of pattern-matching free-form messages.
 */
export type AgenticErrorCode =
  | "TIMEOUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "AGENT_DISCONNECTED"
  | "INTERNAL";

export function classifyAgenticError(message: string): {
  code: AgenticErrorCode;
  retryable: boolean;
} {
  if (/timed?\s?out|timeout/i.test(message)) {
    return { code: "TIMEOUT", retryable: true };
  }
  if (/not connected|disconnected|websocket|socket hang up|ECONNREFUSED|ECONNRESET/i.test(message)) {
    return { code: "AGENT_DISCONNECTED", retryable: true };
  }
  if (/outside allowed|blocked/i.test(message)) {
    return { code: "FORBIDDEN", retryable: false };
  }
  if (/not found|ENOENT|does not exist/i.test(message)) {
    return { code: "NOT_FOUND", retryable: false };
  }
  if (/must include|required|invalid|expected/i.test(message)) {
    return { code: "VALIDATION", retryable: false };
  }
  return { code: "INTERNAL", retryable: false };
}

/**
 * Wrap an agentic service call with standard error-status mapping.
 * Agentic services return `{ error }` objects (not throw). This wrapper
 * maps "outside allowed"/"blocked" errors to 403, other errors to 400,
 * and sends the result as JSON on success.
 *
 * Thrown errors return their sanitized message (no stack) plus a
 * machine-readable `code`/`retryable` — an opaque "internal error" gives
 * the model nothing to act on. Handlers are raced against a hard timeout
 * so a hung local operation can't stall the loop forever, and oversized
 * results are logged (log-only for now) for size-governance telemetry.
 */
export function agenticHandler<T extends object>(
  toolFunction: (req: Request) => Promise<T>,
) {
  return async (req: Request, res: Response) => {
    try {
      const result = await promiseWithTimeout(
        toolFunction(req),
        AGENTIC_HANDLER_TIMEOUT_MS,
        `Tool handler timed out after ${AGENTIC_HANDLER_TIMEOUT_MS}ms (${req.method} ${req.originalUrl})`,
      );
      const errorValue = (result as Record<string, unknown>).error;
      if (typeof errorValue === "string") {
        const { code, retryable } = classifyAgenticError(errorValue);
        return res
          .status(code === "FORBIDDEN" ? 403 : 400)
          .json({ code, retryable, ...result });
      }
      res.json(result);

      const responseBytes = Number(res.getHeader("content-length") || 0);
      if (responseBytes > AGENTIC_RESULT_SIZE_WARN_BYTES) {
        logger.warn(
          `[AgenticHandler] Oversized tool result: ${req.method} ${req.originalUrl} returned ${Math.round(responseBytes / 1024)}KB (warn threshold ${Math.round(AGENTIC_RESULT_SIZE_WARN_BYTES / 1024)}KB)`,
        );
      }
    } catch (error: unknown) {
      const message = errorMessage(error) || "Internal agentic tool error";
      logger.error(`Agentic handler error: ${message}`);
      const { code, retryable } = classifyAgenticError(message);
      res.status(code === "TIMEOUT" ? 504 : 500).json({
        // Sanitized message only — never a stack trace
        error: message.slice(0, 500),
        code,
        retryable,
      });
    }
  };
}

/** Race a promise against a timeout that rejects with `message`. */
function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      timer.unref?.();
    }),
  ]);
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
   * Store or replace a value under a caller-supplied ID. Resets the TTL —
   * used by iterative tools that rebuild an artifact under a stable ID.
   */
  setWithId(id: string, value: T): void {
    this.#map.set(id, { value, createdAt: Date.now() });
    this.#cleanup();
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
    for (const [key, entry] of this.#map) {
      if (now - entry.createdAt > this.#ttlMs) this.#map.delete(key);
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
  const selfBaseUrl = CONFIG.TOOLS_SERVICE_PUBLIC_URL || CONFIG.TOOLS_SERVICE_URL;
  const base = `${selfBaseUrl}/${routePath}`;
  if (!params || Object.keys(params).length === 0) return base;
  const queryString = new URLSearchParams(params).toString();
  return `${base}?${queryString}`;
}

// ─── Tool Result Display Contract ─────────────────────────────

/**
 * Self-describing display metadata attached to visual tool results.
 * Clients render `display` generically — "embed" becomes a sandboxed
 * auto-resizing iframe, "image" an <img> — without needing a per-tool
 * renderer. `url` must be absolute (or a ref the client already
 * resolves, e.g. minio://).
 */
export interface ToolResultDisplay {
  kind: "embed" | "image";
  url: string;
  /** Fallback iframe height in px until the embed reports its own size. */
  height?: number;
  title?: string;
}

export function buildDisplay(
  kind: ToolResultDisplay["kind"],
  url: string,
  options: { height?: number; title?: string } = {},
): ToolResultDisplay {
  return { kind, url, ...options };
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
    background:#f8fafc;
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

// ─── Embed Content Sanitizers ─────────────────────────────────

/**
 * Escape a model/user-provided string for interpolation into embed HTML.
 * Embed titles and similar values are stored verbatim and re-served from
 * the tools origin, so unescaped markup would execute in the embed iframe.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Restrict a model-provided CSS color to characters that cannot escape a
 * style declaration. Returns the fallback for anything suspicious.
 */
export function sanitizeCssColor(value: unknown, fallback: string): string {
  const color = String(value ?? "").trim();
  return /^[#a-zA-Z0-9(),.%\s/-]{1,64}$/.test(color) ? color : fallback;
}

/**
 * Serialize a value for interpolation inside an inline <script> block.
 * Escapes `<` so stored strings containing "</script>" cannot terminate
 * the script element.
 */
export function toEmbedScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// ─── Caller Context Extraction ────────────────────────────────

interface CallerContext {
  project: string;
  username: string;
  agent: string | null;
  traceId: string | null;
  conversationId: string | null;
}

/**
 * Extract caller identity context from request headers.
 * Replaces the duplicated 5-line header extraction block in
 * CreativeRoutes (4 occurrences) and AgenticRoutes.
 */
export function extractCallerContext(req: Request): CallerContext {
  return {
    project: (req.headers[IDENTITY_HEADERS.project] as string) || "tools-api",
    username: (req.headers[IDENTITY_HEADERS.username] as string) || "system",
    agent: (req.headers[IDENTITY_HEADERS.agent] as string) || null,
    traceId: (req.headers["x-trace-id"] as string) || null,
    conversationId: (req.headers[IDENTITY_HEADERS.conversationId] as string) || null,
  };
}

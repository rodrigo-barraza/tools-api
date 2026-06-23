// ─── URL Fetching & Web Search ──────────────────────────────

import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- domhandler's AnyNode is not directly importable under pnpm strict hoisting
type AnyNode = any;

import CONFIG from "../config.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

interface BraveSearchItem {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

interface DuckDuckGoSearchResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl: string;
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000; // 15 second timeout
const MAX_OUTPUT_CHARS = 100_000; // Truncate final markdown output

const USER_AGENT =
  "Mozilla/5.0 (compatible; SunTools/1.0; +https://github.com/sun)";

// Domains that block automated access — skip gracefully
const BLOCKED_DOMAINS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal",
]);

// Google Custom Search JSON API
const GOOGLE_CSE_BASE = "https://www.googleapis.com/customsearch/v1";

const DUCKDUCKGO_HTML_BASE = "https://html.duckduckgo.com/html/";

const DUCKDUCKGO_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ────────────────────────────────────────────────────────────
// URL Fetching
// ────────────────────────────────────────────────────────────

/**
 * Fetch a URL and convert its HTML content to clean markdown.
 */
export async function agenticFetchUrl(
  url: string,
  { selector }: { selector?: string } = {},
) {
  if (!url || typeof url !== "string") {
    return { error: "'url' is required and must be a string" };
  }

  // Validate URL format
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: `Invalid URL: ${url}` };
  }

  // Block internal/local URLs
  if (BLOCKED_DOMAINS.has(parsed.hostname)) {
    return {
      error: `Domain '${parsed.hostname}' is blocked for security reasons.`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      error: `Only http and https protocols are supported. Got: ${parsed.protocol}`,
    };
  }

  let timeout: NodeJS.Timeout | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,text/plain,application/json,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        error: `HTTP ${response.status}: ${response.statusText}`,
        url,
        status: response.status,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    // JSON — return directly
    if (contentType.includes("application/json")) {
      const json = await response.json();
      const text = JSON.stringify(json, null, 2);
      return {
        url,
        contentType: "application/json",
        content:
          text.length > MAX_OUTPUT_CHARS
            ? text.slice(0, MAX_OUTPUT_CHARS) + "\n\n... [truncated]"
            : text,
        charCount: text.length,
        truncated: text.length > MAX_OUTPUT_CHARS,
      };
    }

    // Plain text
    if (contentType.includes("text/plain")) {
      const text = await response.text();
      return {
        url,
        contentType: "text/plain",
        content:
          text.length > MAX_OUTPUT_CHARS
            ? text.slice(0, MAX_OUTPUT_CHARS) + "\n\n... [truncated]"
            : text,
        charCount: text.length,
        truncated: text.length > MAX_OUTPUT_CHARS,
      };
    }

    // HTML — convert to markdown
    const html = await response.text();
    const markdown = htmlToMarkdown(html, { selector });

    return {
      url,
      contentType: contentType.split(";")[0].trim(),
      content:
        markdown.length > MAX_OUTPUT_CHARS
          ? markdown.slice(0, MAX_OUTPUT_CHARS) + "\n\n... [truncated]"
          : markdown,
      charCount: markdown.length,
      truncated: markdown.length > MAX_OUTPUT_CHARS,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return { error: `Request timed out after ${FETCH_TIMEOUT_MS}ms`, url };
    }
    return { error: `Fetch failed: ${errorMessage(error)}`, url };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

// ────────────────────────────────────────────────────────────
// Web Search — Multi-Provider
// Brave → DuckDuckGo (scrape) → Google CSE (deprecated)
// ────────────────────────────────────────────────────────────

const BRAVE_SEARCH_BASE = "https://api.search.brave.com/res/v1/web/search";

export async function agenticWebSearch(
  query: string,
  {
    limit = 5,
    dateRestrict,
    siteSearch,
  }: { limit?: number; dateRestrict?: string; siteSearch?: string } = {},
) {
  if (!query || typeof query !== "string") {
    return { error: "'query' is required and must be a non-empty string" };
  }

  // siteSearch is prepended as site: operator for providers that use query strings
  const effectiveQuery = siteSearch ? `site:${siteSearch} ${query}` : query;
  const clampedLimit = Math.min(Number(limit), 10);

  // ── Provider 1: Brave Search ───────────────────────────────
  if (CONFIG.BRAVE_SEARCH_API_KEY) {
    try {
      const result = await _searchBrave(effectiveQuery, {
        limit: clampedLimit,
        dateRestrict,
      });
      if (!result.error) return result;
      logger.warn(
        `[AgenticWebService] Brave Search failed, trying DuckDuckGo: ${result.error}`,
      );
    } catch (error: unknown) {
      logger.warn(
        `[AgenticWebService] Brave Search exception: ${errorMessage(error)}`,
      );
    }
  }

  // ── Provider 2: DuckDuckGo HTML Scrape (zero-config) ──────
  try {
    const duckDuckGoResult = await _searchDuckDuckGo(effectiveQuery, {
      limit: clampedLimit,
      dateRestrict,
    });
    if (!duckDuckGoResult.error) return duckDuckGoResult;
    logger.warn(
      `[AgenticWebService] DuckDuckGo scrape failed, trying Google CSE: ${duckDuckGoResult.error}`,
    );
  } catch (error: unknown) {
    logger.warn(
      `[AgenticWebService] DuckDuckGo exception: ${errorMessage(error)}`,
    );
  }

  // ── Provider 3: Google Custom Search (deprecated) ─────────
  if (CONFIG.GOOGLE_CLOUD_GEMINI_API_KEY && CONFIG.GOOGLE_CSE_CX) {
    logger.warn(
      "[AgenticWebService] Using deprecated Google CSE fallback — this provider is being discontinued.",
    );
    return _searchGoogleCSE(query, {
      limit: clampedLimit,
      dateRestrict,
      siteSearch,
    });
  }

  return {
    query,
    limit,
    results: [],
    message:
      "All search providers failed. Brave API key not set, DuckDuckGo scrape failed, and Google CSE not configured.",
    provider: null,
  };
}

// ── Brave Search Implementation ──────────────────────────────

async function _searchBrave(
  query: string,
  { limit, dateRestrict }: { limit: number; dateRestrict?: string },
) {
  const params = new URLSearchParams({
    "q": query,
    count: String(limit),
  });

  // Brave freshness parameters: "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year)
  if (dateRestrict) {
    const BraveFreshness = {
      pastDay: "pd",
      pastWeek: "pw",
      pastMonth: "pm",
      pastYear: "py",
    } as const;

    const freshnessMap: Record<string, string> = {
      d1: BraveFreshness.pastDay,
      d7: BraveFreshness.pastWeek,
      w1: BraveFreshness.pastWeek,
      w2: BraveFreshness.pastWeek,
      m1: BraveFreshness.pastMonth,
      m3: BraveFreshness.pastMonth,
      y1: BraveFreshness.pastYear,
    };
    const freshness =
      freshnessMap[dateRestrict as keyof typeof freshnessMap] || dateRestrict;
    params.set("freshness", freshness);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
  };
  if (CONFIG.BRAVE_SEARCH_API_KEY) {
    headers["X-Subscription-Token"] = CONFIG.BRAVE_SEARCH_API_KEY;
  }

  const response = await fetch(`${BRAVE_SEARCH_BASE}?${params}`, {
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      return {
        error: "Brave Search rate limit exceeded.",
        query,
        provider: "brave",
      };
    }
    return {
      error: `Brave Search API error: HTTP ${response.status} — ${body.slice(0, 500)}`,
      query,
      provider: "brave",
    };
  }

  const data = await response.json();
  const webResults = data.web?.results || [];

  const results = webResults.slice(0, limit).map((item: BraveSearchItem) => ({
    title: item.title || "",
    url: item.url || "",
    snippet: item.description?.replace(/<\/?[^>]+(>|$)/g, "").trim() || "",
    displayUrl: item.url ? new URL(item.url).hostname : "",
    age: item.age || "",
  }));

  return {
    query,
    limit,
    results,
    totalResults: String(webResults.length),
    provider: "brave",
  };
}

// ── DuckDuckGo HTML Scrape Implementation ────────────────────

async function _searchDuckDuckGo(
  query: string,
  { limit, dateRestrict }: { limit: number; dateRestrict?: string },
) {
  const formParameters = new URLSearchParams({ "q": query });

  // DDG date restrict: d = past day, w = past week, m = past month
  if (dateRestrict) {
    const duckDuckGoDateRestrictMap: Record<string, string> = {
      d1: "d",
      d7: "w",
      w1: "w",
      w2: "m",
      m1: "m",
      m3: "m",
      y1: "y",
    };
    const mappedDateRestrict = duckDuckGoDateRestrictMap[dateRestrict];
    if (mappedDateRestrict) {
      formParameters.set("df", mappedDateRestrict);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(DUCKDUCKGO_HTML_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": DUCKDUCKGO_BROWSER_USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: formParameters.toString(),
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        error: `DuckDuckGo HTML error: HTTP ${response.status}`,
        query,
        provider: "duckduckgo",
      };
    }

    const html = await response.text();
    const CHEERIOAPI = cheerio.load(html);

    const results: DuckDuckGoSearchResult[] = [];

    CHEERIOAPI(".result").each((_index: number, element: AnyNode) => {
      if (results.length >= limit) return false;

      const $result = CHEERIOAPI(element);
      const $titleAnchor = $result.find(".result__a").first();
      const rawTitle = $titleAnchor.text().trim();
      const rawHref = $titleAnchor.attr("href") || "";
      const rawSnippet = $result.find(".result__snippet").first().text().trim();
      const rawDisplayUrl = $result.find(".result__url").first().text().trim();

      // DDG wraps URLs in a redirect — extract the actual destination
      const resolvedUrl = _decodeDuckDuckGoRedirectUrl(rawHref);

      if (rawTitle && resolvedUrl) {
        results.push({
          title: rawTitle,
          url: resolvedUrl,
          snippet: rawSnippet,
          displayUrl: rawDisplayUrl || _extractHostname(resolvedUrl),
        });
      }
    });

    if (results.length === 0) {
      return {
        error: "DuckDuckGo returned no parseable results (possible rate-limit or CAPTCHA).",
        query,
        provider: "duckduckgo",
      };
    }

    return {
      query,
      limit,
      results,
      totalResults: String(results.length),
      provider: "duckduckgo",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function _decodeDuckDuckGoRedirectUrl(rawHref: string): string {
  try {
    // DDG redirect format: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=...
    const normalizedHref = rawHref.startsWith("//")
      ? `https:${rawHref}`
      : rawHref;
    const parsed = new URL(normalizedHref);
    const encodedDestination = parsed.searchParams.get("uddg");
    if (encodedDestination) {
      return decodeURIComponent(encodedDestination);
    }
  } catch {
    // Not a redirect URL — fall through
  }
  // If it's already a direct URL or parsing failed, return as-is
  if (rawHref.startsWith("http")) return rawHref;
  return "";
}

function _extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// ── Google CSE Implementation (deprecated) ───────────────────

async function _searchGoogleCSE(
  query: string,
  {
    limit,
    dateRestrict,
    siteSearch,
  }: { limit: number; dateRestrict?: string; siteSearch?: string },
) {
  const params = new URLSearchParams({
    key: CONFIG.GOOGLE_CLOUD_GEMINI_API_KEY as string,
    cx: CONFIG.GOOGLE_CSE_CX as string,
    "q": query,
    "num": String(limit),
  });

  if (dateRestrict) params.set("dateRestrict", dateRestrict);
  if (siteSearch) params.set("siteSearch", siteSearch);

  const response = await fetch(`${GOOGLE_CSE_BASE}?${params}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      return {
        error: "Google Custom Search daily quota exhausted (100/day free).",
        query,
        provider: "google_cse",
      };
    }
    return {
      error: `Google CSE API error: HTTP ${response.status} — ${body.slice(0, 500)}`,
      query,
      provider: "google_cse",
    };
  }

  const data = await response.json();

  const results = (data.items || []).map((item: GoogleCseItem) => ({
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet?.replace(/\n/g, " ").trim() || "",
    displayUrl: item.displayLink || "",
  }));

  return {
    query,
    limit,
    results,
    totalResults: data.searchInformation?.totalResults || "0",
    searchTime: data.searchInformation?.searchTime || 0,
    provider: "google_cse",
  };
}

// ────────────────────────────────────────────────────────────
// HTML → Markdown Converter
// ────────────────────────────────────────────────────────────

/**
 * Convert HTML to clean markdown using cheerio.
 * Strips scripts, styles, nav, and other non-content elements.
 */
function htmlToMarkdown(
  html: string,
  { selector }: { selector?: string } = {},
) {
  const CHEERIOAPI = cheerio.load(html);

  // Remove non-content elements
  CHEERIOAPI(
    "script, style, nav, footer, header, noscript, iframe, svg, form, button, input, select, textarea",
  ).remove();
  CHEERIOAPI(
    "[role='navigation'], [role='banner'], [role='complementary'], [aria-hidden='true']",
  ).remove();
  CHEERIOAPI(
    ".cookie-banner, .popup, .modal, .overlay, .sidebar, .ad, .advertisement",
  ).remove();

  // If a CSS selector was provided, focus on that
  let root: Cheerio<AnyNode> = CHEERIOAPI("body");
  if (selector) {
    const selected = CHEERIOAPI(selector);
    if (selected.length > 0) {
      root = selected;
    }
  } else {
    // Try to find main content area
    const mainContent = CHEERIOAPI(
      "main, article, [role='main'], .content, .post-content, .entry-content, #content",
    );
    if (mainContent.length > 0) {
      root = mainContent.first();
    }
  }

  const lines: string[] = [];

  function processNode(element: Cheerio<AnyNode>) {
    if (!element || !element.length) return;

    element.contents().each((_: number, node: AnyNode) => {
      if (node.type === "text") {
        const text = CHEERIOAPI(node).text().trim();
        if (text) {
          lines.push(text);
        }
        return;
      }

      if (node.type !== "tag") return;

      const $node = CHEERIOAPI(node);
      const tag = (
        node as unknown as { tagName?: string }
      ).tagName?.toLowerCase();

      switch (tag) {
        case "h1":
          lines.push(`\n# ${$node.text().trim()}\n`);
          break;
        case "h2":
          lines.push(`\n## ${$node.text().trim()}\n`);
          break;
        case "h3":
          lines.push(`\n### ${$node.text().trim()}\n`);
          break;
        case "h4":
          lines.push(`\n#### ${$node.text().trim()}\n`);
          break;
        case "h5":
        case "h6":
          lines.push(`\n##### ${$node.text().trim()}\n`);
          break;
        case "p":
          lines.push(`\n${$node.text().trim()}\n`);
          break;
        case "br":
          lines.push("\n");
          break;
        case "hr":
          lines.push("\n---\n");
          break;
        case "a": {
          const href = $node.attr("href");
          const text = $node.text().trim();
          if (href && text) {
            lines.push(`[${text}](${href})`);
          } else if (text) {
            lines.push(text);
          }
          break;
        }
        case "img": {
          const alt = $node.attr("alt") || "";
          const sourceAttribute = $node.attr("src") || "";
          if (sourceAttribute) {
            lines.push(`![${alt}](${sourceAttribute})`);
          }
          break;
        }
        case "code":
          if ($node.parent().is("pre")) {
            // Handled by 'pre' case
          } else {
            lines.push(`\`${$node.text().trim()}\``);
          }
          break;
        case "pre": {
          const codeText = $node.text().trim();
          const lang =
            $node
              .find("code")
              .attr("class")
              ?.match(/language-(\w+)/)?.[1] || "";
          lines.push(`\n\`\`\`${lang}\n${codeText}\n\`\`\`\n`);
          break;
        }
        case "blockquote":
          lines.push(`\n> ${$node.text().trim()}\n`);
          break;
        case "ul":
        case "ol":
          $node.children("li").each((i: number, li: AnyNode) => {
            const bullet = tag === "ol" ? `${i + 1}.` : "-";
            lines.push(`${bullet} ${CHEERIOAPI(li).text().trim()}`);
          });
          lines.push("");
          break;
        case "table":
          processTable(CHEERIOAPI, $node, lines);
          break;
        case "strong":
        case "b":
          lines.push(`**${$node.text().trim()}**`);
          break;
        case "em":
        case "i":
          lines.push(`*${$node.text().trim()}*`);
          break;
        case "div":
        case "section":
        case "article":
        case "main":
          processNode($node);
          break;
        default:
          processNode($node);
          break;
      }
    });
  }

  processNode(root);

  // Clean up output
  let output = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Get page title if available
  const title = CHEERIOAPI("title").text().trim();
  if (title) {
    output = `# ${title}\n\n${output}`;
  }

  return output;
}

/**
 * Convert an HTML table to markdown table syntax.
 */
function processTable(
  CHEERIOAPI: CheerioAPI,
  $table: Cheerio<AnyNode>,
  lines: string[],
) {
  const rows: string[][] = [];

  $table.find("tr").each((_: number, tr: AnyNode) => {
    const cells: string[] = [];
    CHEERIOAPI(tr)
      .find("th, td")
      .each((_: number, cell: AnyNode) => {
        cells.push(CHEERIOAPI(cell).text().trim().replace(/\|/g, "\\|"));
      });
    rows.push(cells);
  });

  if (rows.length === 0) return;

  // First row as header
  lines.push(`\n| ${rows[0].join(" | ")} |`);
  lines.push(`| ${rows[0].map(() => "---").join(" | ")} |`);

  for (let i = 1; i < rows.length; i++) {
    lines.push(`| ${rows[i].join(" | ")} |`);
  }
  lines.push("");
}

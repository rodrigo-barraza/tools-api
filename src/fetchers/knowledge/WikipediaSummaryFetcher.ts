import { WIKIPEDIA_SUMMARY_BASE_URL } from "../../constants.ts";

/**
 * Wikipedia REST API fetcher (on-demand summaries).
 * https://en.wikipedia.org/api/rest_v1/ — no auth, fully open.
 * Distinct from the existing WikipediaFetcher (trending pages poller).
 * This fetcher provides on-demand article summaries and "On This Day" data.
 */

export interface WikipediaSummaryResultSuccess {
  found: true;
  title: string;
  displayTitle: string;
  extract: string | null;
  description: string | null;
  thumbnail: string | null;
  originalImage: string | null;
  pageUrl: string | null;
  lastModified: string | null;
  type: string | null;
  language: string;
}

export interface WikipediaSummaryResultNotFound {
  found: false;
  title: string;
  message: string;
}

export type WikipediaSummaryResult = WikipediaSummaryResultSuccess | WikipediaSummaryResultNotFound;

export interface OnThisDayPage {
  title: string;
  description: string | null;
  extract: string | null;
  thumbnail: string | null;
  url: string | null;
}

export interface OnThisDayEvent {
  year: number | null;
  text: string | null;
  pages: OnThisDayPage[];
}

export interface OnThisDayResult {
  date: string;
  type: string;
  count: number;
  events: OnThisDayEvent[];
}

// ─── Get Article Summary ───────────────────────────────────────────

/**
 * Get a summary of a Wikipedia article by title.
 * Returns the lead section with extract text, thumbnail, and content URLs.
 */
export async function getArticleSummary(title: string): Promise<WikipediaSummaryResult> {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  const url = `${WIKIPEDIA_SUMMARY_BASE_URL}/page/summary/${encoded}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    return { found: false, title, message: "Article not found" };
  }
  if (!response.ok) {
    throw new Error(`Wikipedia REST API → ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return {
    found: true,
    title: data.title,
    displayTitle: data.displaytitle || data.title,
    extract: data.extract || null,
    description: data.description || null,
    thumbnail: data.thumbnail?.source || null,
    originalImage: data.originalimage?.source || null,
    pageUrl: data.content_urls?.desktop?.page || null,
    lastModified: data.timestamp || null,
    type: data.type || null,
    language: data.lang || "en",
  };
}

interface RawWikipediaPage {
  title: string;
  description?: string | null;
  extract?: string | null;
  thumbnail?: { source: string } | null;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  } | null;
}

interface RawWikipediaEvent {
  year?: number | null;
  text?: string | null;
  pages?: RawWikipediaPage[] | null;
}

// ─── On This Day ───────────────────────────────────────────────────

/**
 * Get historical events that happened on this day.
 */
export async function getOnThisDay(type: string = "selected", month?: number, day?: number): Promise<OnThisDayResult> {
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const d = day || now.getDate();
  const padM = String(m).padStart(2, "0");
  const padD = String(d).padStart(2, "0");

  const url = `${WIKIPEDIA_SUMMARY_BASE_URL}/feed/onthisday/${type}/${padM}/${padD}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia On This Day → ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as Record<string, RawWikipediaEvent[]>;
  const key = Object.keys(data)[0]; // "selected", "births", etc.
  const entries = data[key] || [];

  return {
    date: `${padM}-${padD}`,
    type,
    count: entries.length,
    events: entries.slice(0, 20).map((e: RawWikipediaEvent) => ({
      year: e.year || null,
      text: e.text || null,
      pages: (e.pages || []).slice(0, 3).map((p: RawWikipediaPage) => ({
        title: p.title,
        description: p.description || null,
        extract: p.extract || null,
        thumbnail: p.thumbnail?.source || null,
        url: p.content_urls?.desktop?.page || null,
      })),
    })),
  };
}

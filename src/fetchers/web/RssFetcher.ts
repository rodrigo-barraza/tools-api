// ─── Parse RSS/Atom Feeds into Structured JSON ──────────────

import xml2js from "xml2js";
import { USER_AGENT } from "../../constants.ts";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS = 50;

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch and parse an RSS or Atom feed.


 */
export async function readRssFeed(url: any, options: Record<string, any> = {}) {
  if (!url || typeof url !== "string") {
    return { error: "Feed URL is required" };
  }

  const { limit = 20 } = options;
  const clampedLimit = Math.min(limit, MAX_ITEMS);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}`, url };
    }

    const xml = await response.text();

    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
    });

    const parsed = await parser.parseStringPromise(xml);

    // Detect feed format and parse accordingly
    if (parsed.rss?.channel) {
      return parseRss2(parsed.rss.channel, url, clampedLimit);
    }
    if (parsed.feed) {
      return parseAtom(parsed.feed, url, clampedLimit);
    }

    return { error: "Unrecognized feed format (expected RSS 2.0 or Atom)", url };
  } catch (error: unknown) {
    if ((error as any).name === "AbortError") {
      return { error: `Feed fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s`, url };
    }
    return { error: `Feed parsing failed: ${(error as Error).message}`, url };
  }
}

// ─── RSS 2.0 Parser ──────────────────────────────────────────────

function parseRss2(channel: any, feedUrl: any, limit: any) {
  const items = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  return {
    format: "rss2",
    feedUrl,
    title: channel.title || null,
    description: channel.description || null,
    link: channel.link || null,
    language: channel.language || null,
    lastBuildDate: channel.lastBuildDate || null,
    itemCount: items.length,
    items: items.slice(0, limit).map((item: any) => ({
      title: item.title || null,
      link: item.link || item.guid?._ || item.guid || null,
      pubDate: item.pubDate || null,
      author: item["dc:creator"] || item.author || null,
      description: stripCdata(item.description || ""),
      content: stripCdata(item["content:encoded"] || ""),
      categories: normalizeArray(item.category),
      guid: typeof item.guid === "object" ? item.guid?._ : item.guid || null,
    })),
  };
}

// ─── Atom Parser ─────────────────────────────────────────────────

function parseAtom(feed: any, feedUrl: any, limit: any) {
  const entries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
      ? [feed.entry]
      : [];

  return {
    format: "atom",
    feedUrl,
    title: extractText(feed.title),
    subtitle: extractText(feed.subtitle) || null,
    link: extractLink(feed.link) || null,
    updated: feed.updated || null,
    itemCount: entries.length,
    items: entries.slice(0, limit).map((entry: any) => ({
      title: extractText(entry.title),
      link: extractLink(entry.link) || null,
      pubDate: entry.published || entry.updated || null,
      author: entry.author?.name || extractText(entry.author) || null,
      description: extractText(entry.summary) || "",
      content: extractText(entry.content) || "",
      categories: normalizeArray(entry.category).map(
        (c: any) => (typeof c === "object" ? c.term || c.label : c),
      ),
      id: entry.id || null,
    })),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function extractText(field: any) {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (field._ !== undefined) return field._;
  return null;
}

function extractLink(link: any) {
  if (!link) return null;
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alternate = link.find((l: any) => l.rel === "alternate") || link[0];
    return alternate?.href || null;
  }
  return link.href || null;
}

function normalizeArray(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function stripCdata(str: any) {
  if (!str) return "";
  return str.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

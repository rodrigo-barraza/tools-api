import { stripHtml } from "@rodrigo-barraza/utilities-library";

/**
 * Fetch weather warnings from Environment Canada for any Canadian region.
 * Scrapes the public warnings page since RSS/Atom feeds and GeoMet API
 * are currently unreliable (404/500).
 * Free, no key required.
 *
 * Region codes follow Environment Canada's convention:
 *   bc74 = Metro Vancouver, on31 = Toronto, qc36 = Montreal,
 *   ab38 = Calgary, sk32 = Saskatoon, mb36 = Winnipeg, etc.
 */

const DEFAULT_REGION_CODE = "bc74";

function buildWarningsPageUrl(regionCode: string): string {
  return `https://weather.gc.ca/warnings/report_e.html?${regionCode}`;
}

function buildCityPageUrl(regionCode: string): string {
  const dashSeparated = regionCode.replace(/(\D+)(\d+)/, "$1-$2");
  return `https://weather.gc.ca/city/pages/${dashSeparated}_metric_e.html`;
}

export type WarningType =
  | "warning"
  | "watch"
  | "advisory"
  | "statement"
  | "ended"
  | "info";

export interface CanadaWarning {
  title: string;
  summary: string;
  type: WarningType;
  source: string;
  url: string;
}

export async function fetchEnvironmentCanadaWarnings(
  regionCode: string = DEFAULT_REGION_CODE,
): Promise<CanadaWarning[]> {
  const warningsPageUrl = buildWarningsPageUrl(regionCode);
  const cityPageUrl = buildCityPageUrl(regionCode);

  let warnings = await tryWarningsPage(warningsPageUrl);
  if (warnings.length === 0) {
    warnings = await tryCityPage(cityPageUrl);
  }
  return warnings;
}

async function tryWarningsPage(url: string): Promise<CanadaWarning[]> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!response.ok) return [];
    const html = await response.text();
    return parseWarningsHtml(html, url);
  } catch {
    return [];
  }
}

async function tryCityPage(url: string): Promise<CanadaWarning[]> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!response.ok) return [];
    const html = await response.text();
    return parseCityWarnings(html, url);
  } catch {
    return [];
  }
}

/**
 * Parse warnings from the EC warnings report page.
 */
function parseWarningsHtml(html: string, pageUrl: string): CanadaWarning[] {
  const warnings: CanadaWarning[] = [];
  // Look for warning/watch/statement sections
  const sectionRegex =
    /<h2[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(html)) !== null) {
    const title = stripHtml(match[1]);
    const content = stripHtml(match[2]);
    if (isWarningTitle(title)) {
      warnings.push({
        title,
        summary: content.substring(0, 500),
        type: classifyWarning(title),
        source: "weather.gc.ca",
        url: pageUrl,
      });
    }
  }
  // Also look for alert banners
  const alertRegex =
    /class="[^"]*alert[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
  while ((match = alertRegex.exec(html)) !== null) {
    const content = stripHtml(match[1]);
    if (content.length > 10 && isWarningContent(content)) {
      const existing = warnings.find((canadaWarning) => content.includes(canadaWarning.title));
      if (!existing) {
        warnings.push({
          title: content.substring(0, 100),
          summary: content.substring(0, 500),
          type: classifyWarning(content),
          source: "weather.gc.ca",
          url: pageUrl,
        });
      }
    }
  }
  return warnings;
}

/**
 * Parse warning banners from the EC city forecast page.
 */
function parseCityWarnings(html: string, pageUrl: string): CanadaWarning[] {
  const warnings: CanadaWarning[] = [];
  const warningRegex =
    /class="[^"]*(?:warning|alert|watch|advisory)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section|a)>/gi;
  let match: RegExpExecArray | null;
  while ((match = warningRegex.exec(html)) !== null) {
    const content = stripHtml(match[1]);
    if (content.length > 5 && isWarningContent(content)) {
      warnings.push({
        title: content.substring(0, 100),
        summary: content.substring(0, 500),
        type: classifyWarning(content),
        source: "weather.gc.ca",
        url: pageUrl,
      });
    }
  }
  return warnings;
}

function classifyWarning(text: string): WarningType {
  const lower = text.toLowerCase();
  if (lower.includes("warning")) return "warning";
  if (lower.includes("watch")) return "watch";
  if (lower.includes("advisory")) return "advisory";
  if (lower.includes("statement")) return "statement";
  if (lower.includes("ended")) return "ended";
  return "info";
}

function isWarningTitle(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("warning") ||
    lower.includes("watch") ||
    lower.includes("advisory") ||
    lower.includes("statement") ||
    lower.includes("alert") ||
    lower.includes("special weather")
  );
}

function isWarningContent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("warning") ||
    lower.includes("watch") ||
    lower.includes("advisory") ||
    lower.includes("alert") ||
    lower.includes("in effect") ||
    lower.includes("issued") ||
    lower.includes("special weather")
  );
}

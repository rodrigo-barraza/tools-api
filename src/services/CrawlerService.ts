// ─── Crawlee + Playwright Orchestration ─────────────────────

import {
  CheerioCrawler,
  Configuration,
} from "crawlee";
import logger from "../logger.ts";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const DEFAULTS = {
  maxConcurrency: 3,
  maxRequestsPerMinute: 30,
  maxRequestRetries: 3,
  requestHandlerTimeoutSecs: 60,
  navigationTimeoutSecs: 30,
  headless: true,
  // Storage directory for Crawlee's persistent state (queues, datasets)
  storageDir: "/tmp/crawlee-storage",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ────────────────────────────────────────────────────────────
// Proxy Configuration
// ────────────────────────────────────────────────────────────
// Uncomment and configure when Bright Data credentials are ready.
// Add BRIGHTDATA_* values to secrets.js and config.js.

/**
 * Build a ProxyConfiguration for Bright Data.
 * Supports datacenter and residential zones.
 *


 */
function buildProxyConfig(_options: Record<string, any> = {}) {
  // ──────────────────────────────────────────────────────────
  // BRIGHT DATA PROXY — UNCOMMENT WHEN READY
  // ──────────────────────────────────────────────────────────
  //
  // import CONFIG from "../config.ts";
  //
  // const {
  //   BRIGHTDATA_CUSTOMER_ID,
  //   BRIGHTDATA_ZONE_DATACENTER,
  //   BRIGHTDATA_ZONE_RESIDENTIAL,
  //   BRIGHTDATA_ZONE_ISP,
  //   BRIGHTDATA_PASSWORD,
  // } = CONFIG;
  //
  // if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_PASSWORD) {
  //   logger.warn("[Crawler] Bright Data credentials not configured — running without proxy");
  //   return null;
  // }
  //
  // const zone = options.zone || "datacenter";
  // const zoneMap = {
  //   datacenter: BRIGHTDATA_ZONE_DATACENTER || "datacenter",
  //   residential: BRIGHTDATA_ZONE_RESIDENTIAL || "residential",
  //   isp: BRIGHTDATA_ZONE_ISP || "isp",
  // };
  //
  // const proxyUrl =
  //   `http://brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${zoneMap[zone]}` +
  //   `:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:22225`;
  //
  // logger.info(`[Crawler] Proxy configured — zone: ${zone}`);
  //
  // return new ProxyConfiguration({
  //   proxyUrls: [proxyUrl],
  // });
  // ──────────────────────────────────────────────────────────

  return null;
}

// ────────────────────────────────────────────────────────────
// Crawlee Configuration
// ────────────────────────────────────────────────────────────

// Disable Crawlee's default storage to prevent cluttering the project dir.
// We use an explicit storageDir instead.
const crawleeConfig = Configuration.getGlobalConfig();
crawleeConfig.set("persistStorage", false);

// ────────────────────────────────────────────────────────────
// Single-Page Crawl (Cheerio — No Browser)
// ────────────────────────────────────────────────────────────

/**
 * Crawl a single URL using Cheerio (static HTML parsing).
 * Best for: Static pages, forums, blogs — much faster than Playwright.
 *


 * @param {function} options.extractFn - ($, request) => data. Receives Cheerio root.

 * @returns {Promise<object>} Extracted data or error
 */
export async function crawlSingleStatic(url: any, options: Record<string, any> = {}) {
  const { extractFn, proxyZone } = options;

  if (!extractFn) {
    return { error: "extractFn is required" };
  }

  let result: any = null;
  let crawlError: any = null;

  const proxyConfiguration = proxyZone ? buildProxyConfig({ zone: proxyZone }) : null;

  const crawler = new CheerioCrawler({
    maxConcurrency: 1,
    maxRequestRetries: DEFAULTS.maxRequestRetries,
    requestHandlerTimeoutSecs: DEFAULTS.requestHandlerTimeoutSecs,
    useSessionPool: true,
    persistCookiesPerSession: true,
    // @ts-expect-error - suppress remaining error
    ...(proxyConfiguration && { proxyConfiguration }),

    additionalHttpHeaders: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },

    async requestHandler({ $, request }: any) {
      logger.info(`[Crawler] Processing (static): ${request.url}`);

      try {
        result = await extractFn($, request);
      } catch (error: any) {
        crawlError = error;
        logger.error(`[Crawler] Extract failed for ${request.url}: ${error.message}`);
      }
    },

    async failedRequestHandler({ request }: any, error: any) {
      crawlError = error;
      logger.error(`[Crawler] Failed after retries: ${request.url} — ${error.message}`);
    },
  } as any);

  try {
    await crawler.run([url]);
  } catch (error: any) {
    return { error: `Crawler failed: ${error.message}`, url };
  }

  if (crawlError) {
    return { error: crawlError.message, url };
  }

  return { url, data: result };
}

